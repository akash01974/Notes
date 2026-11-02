# Data and Synchronization Design — Cross-Platform ColorOS Notes Replica

| Field | Value |
|---|---|
| **Status** | DESIGN SPECIFICATION — Phase 1 Milestone 2 |
| **Date** | 2026-11-02 |
| **Objective** | Comprehensive local-first data architecture, Room v47 schema translation, sync protocol, and backend evaluation |
| **Target Architecture** | Offline-First Reactive SQLite Store with Deterministic Delta Synchronization & E2EE |
| **Policy** | Specification only. **No account creation, backend deployment, or scaffolding.** |

---

## 1. Local-First Data Philosophy & Architecture

The ColorOS Notes replica is designed as an **offline-first, local-primary application**:
1. **Local Primacy**: 100% of read and write operations execute against the local SQLite database instantly with zero network latency.
2. **Schema Fidelity**: The local schema directly reflects the verified **Room v47** database structure (`nearme_note.db`), ensuring effortless data migration and complete behavioral compatibility with the original app.
3. **Decoupled Synchronization**: Synchronization is an asynchronous, background process that observes local state changes and replicates them to an open cloud backend without blocking user interactions.
4. **Data Ownership & E2EE**: User notes can be end-to-end encrypted before leaving the client device, preventing server-side inspection.

```
+─────────────────────────────────────────────────────────────────────────────+
|                             LOCAL CLIENT STORAGE                            |
|                                                                             |
|  ┌─────────────────────────────────────┐   ┌─────────────────────────────┐  |
|  │          SQLite Database            │   │      Attachment Store       │  |
|  │  - 14 Tables (Room v47 Schema)      │   │  - images/                  │  |
|  │  - WAL Journal Mode (Concurrent)    │   │  - record/  (MP3 audio)     │  |
|  │  - Mutation State (0=New,1=Sync,2=Mod)│ │  - paint/   (Vector JSON/PNG)│ |
|  └──────────────────┬──────────────────┘   └──────────────┬──────────────┘  |
+─────────────────────┼─────────────────────────────────────┼─────────────────+
                      │ Local Change Stream                 │ Binary Files
                      ▼                                     ▼
+─────────────────────────────────────────────────────────────────────────────+
|                          SYNC ORCHESTRATOR ENGINE                           |
|  - Outbox Queue Manager              - Conflict Detection (LWW + Clock)     |
|  - E2EE Cipher (XChaCha20-Poly1305)  - Resumable Chunked Uploader           |
+──────────────────────────────────────┬──────────────────────────────────────+
                                       │ Encrypted JSON & Binary Payloads
                                       ▼ HTTPS / WebSockets
+─────────────────────────────────────────────────────────────────────────────+
|                           OPEN CLOUD BACKEND                                |
|  - PostgreSQL / Supabase Store       - S3 / Object Storage (Blobs)          |
|  - User Identity & Auth (OIDC)       - Row-Level Security (RLS)             |
+─────────────────────────────────────────────────────────────────────────────+
```

---

## 2. Room v47 Cross-Platform Schema Mapping

The original application runs AndroidX Room at version 47 (`AppDatabase_Impl.java`). The table below documents the cross-platform mapping for all 14 tables:

| # | Table Name | Column Count | Primary Key | Key Foreign Keys | Purpose & Cross-Platform Role |
|---|---|:---:|---|---|---|
| 1 | `rich_notes` | 48 | `local_id` (TEXT) | `folder_id -> folders(guid)` | **Core Note Table**: Holds TipTap HTML (`html_text`), plain text (`text`), raw text (`raw_text`), title (`title`), inline LRC (`attachment_lrc`), and sync state. |
| 2 | `attachments` | 13 | `attachment_id` (TEXT) | `rich_note_id -> rich_notes(local_id) ON DELETE CASCADE` | **Attachment Metadata**: Links images, audio, video, files, and cards; tracks MD5, dimensions, and cloud URLs. |
| 3 | `folders` | 14 | `_id` (INT AUTO) | None (UUID in `guid`) | **Folder Organization**: Category names, encryption flags, custom order, and timestamps. |
| 4 | `todo` | 20 | `local_id` (TEXT) | `parent_id -> todo(local_id)` | **Checklist & Tasks**: Todo items, alarm timestamps, completion status, and colors. |
| 5 | `speech_log_info`| 18 | `summary_id` (TEXT) | `rich_note_id -> rich_notes(local_id)` | **Voice Call & Audio Logs**: Contact names, numbers, speech mark timestamps, and LRC links. |
| 6 | `paint_notes` | 21 | `id` (TEXT) | None | **Standalone Paint Canvas**: Vector drawing notes, preview images, and feature lists. |
| 7 | `paint_attachments`| 9 | `id` + `paint_note_id` | `paint_note_id -> paint_notes(id)` | **Paint Blocks**: Sub-assets linked to drawing canvases. |
| 8 | `notes` | 31 | `_id` (INT AUTO) | None | **Legacy Notes Table**: Preserved for backward-compatible import from older ColorOS versions. |
| 9 | `notes_attributes`| 13 | `_id` (INT AUTO) | `note_guid -> notes(guid)` | **Legacy Attributes**: Legacy attachment and style tracking. |
| 10 | `words` | 5 | `_id` (INT AUTO) | `note_guid -> notes(guid)` | **Legacy Search Tokens**: Full-text search token index. |
| 11 | `alarm_note` | 2 | `guid` (TEXT) | `guid -> notes(guid)` | **Legacy Alarms**: Quick lookup for scheduled note reminders. |
| 12 | `note_skin` | 12 | `id` + `condition` | None | **Themes & Skins**: Color palette definitions, background assets, and preview thumbnails. |
| 13 | `note_paragraph_style`| 14 | `id` + `condition` | None | **Paragraph Presets**: Typography and layout templates. |
| 14 | `collect_privacy`| 4 | `_id` (INT AUTO) | None | **Privacy Log**: Telemetry and consent records (can be zeroed/noop). |

### Core Entity DDL Specification (SQLite3 Compatible)

```sql
-- 1. Rich Notes Table (Core Content)
CREATE TABLE IF NOT EXISTS `rich_notes` (
    `local_id` TEXT NOT NULL PRIMARY KEY,
    `global_id` TEXT,
    `text` TEXT NOT NULL,
    `raw_text` TEXT NOT NULL,
    `html_text` TEXT NOT NULL,
    `folder_id` TEXT NOT NULL DEFAULT '00000000_0000_0000_0000_000000000000',
    `timestamp` INTEGER NOT NULL,
    `create_time` INTEGER NOT NULL,
    `update_time` INTEGER NOT NULL,
    `top_time` INTEGER NOT NULL DEFAULT 0,
    `recycle_time` INTEGER NOT NULL DEFAULT 0,
    `alarm_time` INTEGER NOT NULL DEFAULT 0,
    `state` INTEGER NOT NULL DEFAULT 0, -- 0=New, 1=Synced, 2=Modified
    `deleted` INTEGER NOT NULL DEFAULT 0,
    `skin_id` TEXT NOT NULL DEFAULT 'default',
    `title` TEXT,
    `raw_title` TEXT,
    `recycle_time_pre` INTEGER DEFAULT 0,
    `alarm_time_pre` INTEGER DEFAULT 0,
    `skin_id_pre` TEXT,
    `extra` TEXT,
    `version` INTEGER NOT NULL DEFAULT 1,
    `is_local` INTEGER NOT NULL DEFAULT 1,
    `is_preset` INTEGER NOT NULL DEFAULT 0,
    `from_package` TEXT,
    `web_notes` TEXT,
    `sysVersion` INTEGER DEFAULT 1,
    `encrypted` INTEGER NOT NULL DEFAULT 0,
    `encrypted_pre` INTEGER NOT NULL DEFAULT 0,
    `encryptSysVersion` INTEGER,
    `attachment_extra` TEXT,
    `summary_title` TEXT,
    `summary_content` TEXT,
    `summary_phone_name` TEXT,
    `summary_phone_number` TEXT,
    `summary_attachment` TEXT,
    `summary_attachment_size` INTEGER NOT NULL DEFAULT 0,
    `summary_speech_flag` INTEGER NOT NULL DEFAULT 0,
    `summary_speech_type` INTEGER NOT NULL DEFAULT 0,
    `summary_show_icon` INTEGER NOT NULL DEFAULT 0,
    `summary_note_type_flag` INTEGER NOT NULL DEFAULT 0,
    `is_cover_paint_not_char_count` INTEGER NOT NULL DEFAULT 0,
    `is_summary_edit` INTEGER NOT NULL DEFAULT 0,
    `is_paint_pic` INTEGER NOT NULL DEFAULT 0,
    `summary_version` INTEGER NOT NULL DEFAULT 0,
    `all_attachment_file_name` TEXT,
    `attachment_lrc` TEXT,
    `sys_protocol_version` INTEGER NOT NULL DEFAULT 1,
    `file_download_time` INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY(`folder_id`) REFERENCES `folders`(`guid`) ON UPDATE CASCADE ON DELETE SET DEFAULT
);

CREATE INDEX IF NOT EXISTS `index_rich_notes_update_time` ON `rich_notes` (`update_time`);
CREATE INDEX IF NOT EXISTS `index_rich_notes_folder_id` ON `rich_notes` (`folder_id`);
CREATE INDEX IF NOT EXISTS `index_rich_notes_deleted` ON `rich_notes` (`deleted`);
CREATE INDEX IF NOT EXISTS `index_rich_notes_state` ON `rich_notes` (`state`);

-- 2. Attachments Table
CREATE TABLE IF NOT EXISTS `attachments` (
    `attachment_id` TEXT NOT NULL PRIMARY KEY,
    `rich_note_id` TEXT NOT NULL,
    `type` INTEGER NOT NULL, -- 0=Pic, 1=Paint, 2=Voice, 10=File, 13=Video, etc.
    `state` INTEGER NOT NULL DEFAULT 0, -- 0=New, 1=Synced, 2=Modified
    `md5` TEXT,
    `url` TEXT,
    `checkPayload` TEXT,
    `file_name` TEXT,
    `cloud_metadata` TEXT,
    `extra` TEXT,
    `width` INTEGER DEFAULT 0,
    `height` INTEGER DEFAULT 0,
    `associate_attachment_id` TEXT,
    FOREIGN KEY(`rich_note_id`) REFERENCES `rich_notes`(`local_id`) ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS `index_attachments_rich_note_id` ON `attachments` (`rich_note_id`);
CREATE INDEX IF NOT EXISTS `index_attachments_state` ON `attachments` (`state`);
```

---

## 3. Data Representation for Complex Subsystems

### 3.1 Vector Drawing Data Format (Replacing Closed `.bin`)
The original application stores drawing strokes in opaque `.bin` files via `libinkEngineNative.so`. In the cross-platform replica, stroke data is stored in **structured JSON** at `PaintInfo.dataPath`:

```json
{
  "version": 1,
  "canvasWidth": 1080,
  "canvasHeight": 1920,
  "backgroundType": "blank",
  "strokes": [
    {
      "id": "stroke-001",
      "tool": "pen",
      "color": "#1F1F1FFF",
      "baseWidth": 4.5,
      "points": [
        { "x": 120.5, "y": 340.2, "pressure": 0.42, "time": 1730571000120 },
        { "x": 122.1, "y": 343.8, "pressure": 0.58, "time": 1730571000135 },
        { "x": 125.0, "y": 348.1, "pressure": 0.65, "time": 1730571000150 }
      ]
    }
  ],
  "previewPngPath": "paint/img_paint_001.png"
}
```
- **Fidelity**: Preserves pressure, coordinates, and timestamp curves for full undo/redo and re-editing.
- **Portability**: Human-readable, lossless, and renderable by any 2D canvas (HTML5, Skia, Cairo).

### 3.2 Audio & LRC Data Format
- **Audio File**: Standard MP3 container (`notes/record/rec_{attachmentId}.mp3`).
- **Timeline Transcription**: Stored as standard LRC text inside `rich_notes.attachment_lrc` and `speech_log_info`:
  ```text
  [00:00.00]ColorOS Notes audio recording started
  [00:02.45]First paragraph transcribed from audio
  [00:06.12]Second paragraph synchronized with playback
  ```

---

## 4. Synchronization Protocol & Conflict Resolution

### 4.1 Delta Synchronization Protocol
The sync engine uses a **Mutation Outbox Pattern** with client-assigned UUIDs:

1. **Client Mutation Recording**:
   - Any local insert/update sets `state = 2` (or `0` for new) and updates `update_time = UTC_NOW()`.
   - Any local delete sets `deleted = 1`, `state = 2`, and `update_time = UTC_NOW()`.
2. **Delta Push (Client -> Cloud)**:
   - Client queries `SELECT * FROM rich_notes WHERE state IN (0, 2) LIMIT 50`.
   - Sends batch payload to `/sync/push` endpoint.
   - Server commits batch and returns acknowledged UUIDs.
   - Client updates `state = 1` for acknowledged rows.
3. **Delta Pull (Cloud -> Client)**:
   - Client sends `last_sync_timestamp` to `/sync/pull`.
   - Server returns all rows where `server_update_time > last_sync_timestamp`.
   - Client applies updates in a local transaction and advances its local sync anchor.

### 4.2 Deterministic Conflict Resolution (LWW with Block-Level Fallback)

```mermaid
flowchart TD
    A[Incoming Cloud Note Update] --> B{Does note exist locally?}
    B -- No --> C[Insert Note Locally (state=1)]
    B -- Yes --> D{Is local note modified? state in 0,2}
    D -- No (state=1) --> E[Overwrite Local with Cloud (state=1)]
    D -- Yes (Concurrent Edit) --> F{Compare update_time}
    F -- Cloud is Newer --> G[Apply Cloud Version as Active]
    G --> H[Fork Divergent Local Note to 'Conflict Copies' Folder]
    F -- Local is Newer --> I[Reject Cloud Update & Push Local on Next Sync]
```

- **Conflict Forking**: When both client and server have modified a note since the last sync anchor, the version with the later timestamp wins. The losing version is **never discarded**; it is automatically forked into a dedicated `"Conflict Copies"` folder with title `"[Conflict] Original Title"`, guaranteeing zero data loss.

### 4.3 Binary Attachment Synchronization
1. Attachments are uploaded independently of notes to keep JSON sync fast.
2. The client calculates the SHA-256 / MD5 hash of the local file.
3. Before uploading, it queries the backend: `HEAD /storage/attachments/{md5}`.
4. If the file exists on the server (deduplication), the server returns the existing remote URL immediately.
5. If absent, the client performs a chunked, resumable upload.
6. Once uploaded, `attachments.state` is set to `1` (Synced).

---

## 5. End-to-End Encryption (E2EE) Specification

For users requiring strict privacy, the architecture supports an optional **Zero-Knowledge E2EE Mode**:
- **Key Derivation**: Master key derived from user passphrase using **Argon2id** (`memory: 64MB`, `iterations: 3`, `parallelism: 4`, salt: 16 bytes).
- **Cipher**: **XChaCha20-Poly1305** authenticated encryption (256-bit key, 192-bit nonce).
- **Encrypted Payload**: Note title, body JSON, HTML, and attachment blobs are encrypted locally before transmission. The cloud backend stores only opaque ciphertexts and metadata timestamps.

---

## 6. Cloud Backend Comparison & Evaluation

| Evaluation Criterion | Candidate 1: Supabase (PostgreSQL + PostgREST) | Candidate 2: Appwrite | Candidate 3: Custom REST + SQLite Sync Server | Candidate 4: ElectricSQL / PowerSync |
|---|---|---|---|---|
| **Architecture Fit** | ✅ **Very High** (PostgreSQL mirrors SQLite types; built-in S3 blob storage; RLS security) | ⚠️ **Moderate** (Document-oriented NoSQL abstraction; relational mapping requires extra work) | ⚠️ **Moderate** (Full control, but high ongoing maintenance burden for sync logic) | ⚠️ **Moderate** (Excellent SQLite sync, but newer ecosystem with potential breaking changes) |
| **Offline-First Support** | ✅ **High** (Client drives delta sync via timestamps and outbox table) | ⚠️ **Moderate** (Requires custom local outbox queue) | ✅ **High** (Engineered specifically for offline outbox) | ✅ **Very High** (Built specifically for local SQLite replication) |
| **Authentication** | ✅ **Built-in** (OIDC, OAuth, Magic Link, Email/Password) | ✅ **Built-in** (Comprehensive auth suite) | ❌ **Must build** (JWT, refresh tokens, password hashing) | ⚠️ **Relies on Supabase/Postgres auth** |
| **Binary File Storage** | ✅ **Built-in S3 API** (CDN-backed, signed URLs, resumable uploads) | ✅ **Built-in Storage** (Buckets, chunked uploads) | ❌ **Must build** (Must integrate AWS S3 / MinIO manually) | ❌ **Requires external blob store** |
| **Self-Hostability** | ✅ **Flawless** (Official Docker Compose stack; runs on any VPS) | ✅ **Flawless** (Official Docker Compose stack) | ✅ **Flawless** (Single Go/Rust binary) | ⚠️ **Complex** (Requires Elixir sync service + Postgres) |
| **Cost & Scalability** | ✅ **Free Tier / Low Cost** (Generous free tier; self-hosting is 100% free) | ✅ **Free Tier / Low Cost** | ✅ **Lowest** (Runs on $5/mo VPS) | ⚠️ **Higher** (Usage-based sync pricing or self-host overhead) |
| **Vendor Lock-In** | ✅ **Lowest** (Standard PostgreSQL; easy migration via `pg_dump`) | ⚠️ **Moderate** (Proprietary Appwrite schemas) | ✅ **Zero** (Custom open schema) | ⚠️ **Moderate** |

### Backend Recommendation:
**Supabase (Self-Hostable PostgreSQL)** is the clear front-runner:
1. PostgreSQL directly mirrors our SQLite Room v47 relational schema with zero impedance mismatch.
2. Built-in S3-compatible Object Storage handles image, audio, and video attachments out of the box.
3. Row-Level Security (RLS) guarantees complete multi-tenant user data isolation.
4. Users have complete freedom to use the hosted Supabase cloud or self-host via Docker on their own infrastructure.
