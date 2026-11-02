# Attachment Lifecycle Audit

| Field            | Value                        |
|------------------|------------------------------|
| **Document ID**  | REA-INVEST-003               |
| **Status**       | DRAFT — Phase 1, Step 3      |
| **Date**         | 2026-11-02                   |
| **Project**      | ColorOS Notes Reverse-Engineering Audit |
| **Scope**        | Full attachment type lifecycle: insertion → storage → DB → cloud → portability |

## Confidence Legend

| Label                  | Meaning                                                                         |
|------------------------|---------------------------------------------------------------------------------|
| **VERIFIED**           | Directly observed in decompiled source code or byte-level artifacts             |
| **STRONGLY SUPPORTED** | Derived from two or more mutually-consistent source references                  |
| **INFERRED**           | Reasonable deduction from naming, Android conventions, or partial evidence      |
| **UNKNOWN**            | Not established by current investigation; requires further analysis             |

---

## 1. Overview — Attachment System Architecture

ColorOS Notes implements a layered attachment pipeline that spans four runtime boundaries:

```
┌───────────────────────────────────────────────────────────┐
│  WebView / JS Editor (rich-text frontend)                 │
│  - Renders attachment blocks (image, video, paint, etc.)  │
│  - Invokes Java bridge for media operations               │
└────────────────┬──────────────────────────────────────────┘
                 │ Android WebView JavascriptInterface
                 ▼
┌───────────────────────────────────────────────────────────┐
│  Native Bridge Layer (Java/Kotlin)                        │
│  - callInsert*/callUpdate* handler methods                │
│  - Deserialises JS-side JSON into typed model objects     │
│  - Orchestrates file I/O and DB writes                    │
└──────┬──────────────────────┬─────────────────────────────┘
       │                      │
       ▼                      ▼
┌─────────────┐     ┌──────────────────────────────────────┐
│ Local FS    │     │ Room Database (SQLite)               │
│ /files/notes│     │ Tables: attachments, speech_log_info │
│  /images/   │     │ FK: rich_note_id → notes table       │
│  /record/   │     └──────────────┬───────────────────────┘
│  /paint/    │                    │
│  /thumb/    │                    ▼
└─────────────┘     ┌──────────────────────────────────────┐
                    │ Cloud Sync Layer                     │
                    │ - cloud_metadata JSON column         │
                    │ - state machine (state column)       │
                    │ - MD5 integrity field                │
                    └──────────────────────────────────────┘
```

**VERIFIED:** The `attachments` Room entity maps to a SQLite table and carries a `state` column driving cloud-sync state transitions.  
**STRONGLY SUPPORTED:** The JS→Java bridge is implemented as a `@JavascriptInterface`-annotated class; each `callInsert*FromJava` / `callUpdate*FromJava` symbol corresponds to one bridge handler method.  
**INFERRED:** A single `richNoteId` foreign key ties every attachment row to a parent note row, enabling cascade operations (delete-note → delete all attachments).  

---

## 2. AttachData Model — Field-Count Discrepancy Resolution

Three different field counts appear across investigations: **16**, **19**, and **10**. These are not contradictory; they refer to three distinct class variants.

### 2.1 Main editor `AttachData` — 16 fields (VERIFIED)

Used for the primary note editor.

| # | Field Name                         | Type           | Purpose |
|---|------------------------------------|----------------|---------|
| 1 | `addToPrevGroup`                   | `boolean`      | Attach to the preceding block group |
| 2 | `insertToEndInNonEditMode`         | `boolean`      | Insert at document end when not in edit mode |
| 3 | `insertToLastNonEmptyParagraph`    | `boolean`      | Target last non-empty paragraph on insert |
| 4 | `afterAttachId`                    | `String?`      | Insert after the block with this ID |
| 5 | `card`                             | `CardAttr?`    | Web / generic card payload |
| 6 | `image`                            | `ImageInfo?`   | Image attachment payload |
| 7 | `record`                           | `RecordAttr?`  | Audio/voice recording payload |
| 8 | `paintInfo`                        | `PaintInfo?`   | Paint/drawing payload |
| 9 | `contactCard`                      | `ContactCardAttr?` | Contact card payload |
| 10 | `scheduleCard`                    | `ScheduleCardAttr?` | Schedule/calendar card payload |
| 11 | `fileCard`                        | `FileCardData?` | File card payload |
| 12 | `videoCard`                       | `VideoData?`   | Video attachment payload |
| 13 | `isInsertByTransform`             | `boolean`      | Triggered by a block-type transform |
| 14 | `notInsertIfNextNodeIsPaint`      | `boolean`      | Guard: suppress insert if next block is a paint |
| 15 | `insertAfterToAttachid`           | `String?`      | Secondary positional anchor (after-insert) |
| 16 | `insertPosition`                  | `Integer?`     | Explicit numeric cursor position override |

### 2.2 Coverpaint variant `AttachData` — 10 fields (VERIFIED)

A trimmed variant used specifically for the cover-paint editing flow. Omits `videoCard`, `isInsertByTransform`, `notInsertIfNextNodeIsPaint`, `paintInfo` (replaced by `paint: PaintAttr`), `afterAttachId`, `insertAfterToAttachid`, and `insertPosition`.

| # | Field Name                   | Type                |
|---|------------------------------|---------------------|
| 1 | `addToPrevGroup`             | `boolean`           |
| 2 | `card`                       | `CardAttr?`         |
| 3 | `contactCard`                | `ContactCardAttr?`  |
| 4 | `fileCard`                   | `FileCardData?`     |
| 5 | `image`                      | `ImageInfo?`        |
| 6 | `insertToEndInNonEditMode`   | `boolean`           |
| 7 | `paint`                      | `PaintAttr?`        |
| 8 | `record`                     | `RecordAttr?`       |
| 9 | `scheduleCard`               | `ScheduleCardAttr?` |
| 10 | `videoCard`                 | `VideoData?`        |

**Key difference:** Uses `PaintAttr` (8 fields, cover-paint specific) instead of `PaintInfo` (24 fields, full editor paint).

### 2.3 The "19-field" count — INFERRED

The discrepancy likely arises from counting the coverpaint `AttachData` fields alongside 9 additional positional/control fields that appear only in the main variant. No 19-field class has been directly observed; this count may reflect an intermediate SDK version or a different code path that merges both sets.

---

## 3. Attachment Category Lifecycle Details

---

### 3.1 Image and Gallery Attachments

**Attachment types:** `TYPE_PICTURE = 0`, `TYPE_COVER_PICTURE = 3`, `TYPE_LRC_PICTURE = 9`

#### 3.1.a JavaScript Insertion Handler and Payload Schema

**STRONGLY SUPPORTED** — The JS editor fires a bridge call carrying a serialised `ImageInfo` object as JSON.

```json
{
  "attachId":                 "<uuid-string>",
  "src":                      "<local-file-path-or-uri>",
  "srcExist":                 true,
  "width":                    1080,
  "height":                   1920,
  "isAiKit":                  false,
  "placeholderRelativePath":  "thumb/<uuid>.jpg"
}
```

#### 3.1.b Native Bridge Method

**VERIFIED** — Handler name: `callInsertImageFromJava`  
Update path: `callUpdateImageFromJava`

The insert handler deserialises the JSON payload into an `ImageInfo` instance, writes the attachment row to the DB, and calls back to JS with a confirmation payload including the final `attachId`.

#### 3.1.c Java/Kotlin Model — `ImageInfo` (7 fields, VERIFIED)

| # | Field                      | Type      | Notes |
|---|----------------------------|-----------|-------|
| 1 | `attachId`                 | `String`  | UUID identifying this attachment block |
| 2 | `src`                      | `String`  | Absolute local file path or `content://` URI |
| 3 | `srcExist`                 | `Boolean` | Whether the source file is present on disk |
| 4 | `width`                    | `Int`     | Image width in px |
| 5 | `height`                   | `Int`     | Image height in px |
| 6 | `isAiKit`                  | `Boolean` | Image originated from an AI generation feature |
| 7 | `placeholderRelativePath`  | `String`  | Relative path to the thumbnail/placeholder image |

#### 3.1.d Local File Creation and Storage Location

**INFERRED** (from Android conventions and class names):

- Full-resolution image: `/data/user/0/com.coloros.note/files/notes/images/<attachId>.<ext>`
- Thumbnail: `/data/user/0/com.coloros.note/files/notes/thumb/<uuid>.jpg`
- Cover picture: likely stored under a `cover/` subdirectory or named with a `cover_` prefix — **UNKNOWN** exact path.

#### 3.1.e URI / Path Resolution

**INFERRED** — The `src` field may carry either an absolute `/data/user/0/…` path or a `content://` URI from the Android MediaStore. The bridge layer likely normalises both to a local copy before persisting.  
`placeholderRelativePath` is resolved relative to the app's files root (`context.filesDir`).

#### 3.1.f Database Records

**VERIFIED** — One row in the `attachments` table per image:

| Column                  | Value for image |
|-------------------------|-----------------|
| `attachment_id`         | `attachId` UUID |
| `rich_note_id`          | Parent note ID  |
| `type`                  | `0` (PICTURE) or `3` (COVER_PICTURE) or `9` (LRC_PICTURE) |
| `url`                   | Local file path |
| `md5`                   | File MD5 hash   |
| `state`                 | Sync state enum |
| `width` / `height`      | Image dimensions|
| `cloud_metadata`        | JSON (UNKNOWN exact schema) |
| `extra`                 | UNKNOWN usage   |

#### 3.1.g Preview, Opening, Editing, Deletion, Cleanup

**INFERRED:**
- **Preview:** JS renders `<img>` using the `src` path delivered via bridge.
- **Full-screen view:** Native activity launched on block tap.
- **Editing:** AI Kit flow sets `isAiKit = true`; separate editor activity for crop/filter.
- **Deletion:** JS signals block removal → bridge deletes DB row → file deletion scheduled (timing UNKNOWN, may be deferred to note save).
- **Cleanup:** UNKNOWN whether orphaned image files are garbage-collected on startup.

#### 3.1.h Cloud-Sync Metadata

**STRONGLY SUPPORTED** — `cloud_metadata` column holds a JSON blob. `md5` column enables server-side deduplication. `state` column drives the upload/download state machine. Exact server API schema: **UNKNOWN**.

#### 3.1.i Cross-Platform Portability Assessment

**STRONGLY SUPPORTED** — Highly non-portable:
- Paths are hardcoded to `com.coloros.note` private data directory.
- `content://` URIs are device-local.
- `isAiKit` implies server-side AI dependency.
- `placeholderRelativePath` is relative to app storage; meaningless outside the app.

---

### 3.2 Video Attachments

**Attachment types:** `TYPE_VIDEO = 13`

#### 3.2.a JavaScript Insertion Handler and Payload Schema

**STRONGLY SUPPORTED** — JS first calls `callInsertVideoPlaceHolderFromJava` with a placeholder, then `callUpdateVideoFromJava` once processing is complete.

Payload (final update):
```json
{
  "attachId":       "<uuid>",
  "videoAttachId":  "<uuid>",
  "videoSrc":       "<local-video-path>",
  "picSrc":         "<thumbnail-path>",
  "fileName":       "video_20261102.mp4",
  "fileSize":       10485760,
  "duration":       120,
  "width":          1920,
  "height":         1080,
  "timeStamp":      1730000000000,
  "addToNoteTime":  1730000001000
}
```

#### 3.2.b Native Bridge Methods

**VERIFIED:**
- `callInsertVideoPlaceHolderFromJava` — inserts a loading placeholder block
- `callUpdateVideoFromJava` — replaces placeholder with full `VideoData` payload

#### 3.2.c Java/Kotlin Model — `VideoData` (11 fields, VERIFIED)

| # | Field           | Type     | Notes |
|---|-----------------|----------|-------|
| 1 | `attachId`      | `String` | Primary block ID |
| 2 | `videoAttachId` | `String` | Attachment DB row ID for the video file |
| 3 | `videoSrc`      | `String` | Local path to video file |
| 4 | `picSrc`        | `String` | Local path to poster/thumbnail |
| 5 | `fileName`      | `String` | Display filename |
| 6 | `fileSize`      | `Long`   | File size in bytes |
| 7 | `duration`      | `Long`   | Duration in seconds or ms (UNKNOWN unit) |
| 8 | `width`         | `Int`    | Video width in px |
| 9 | `height`        | `Int`    | Video height in px |
| 10 | `timeStamp`    | `Long`   | Source file timestamp |
| 11 | `addToNoteTime`| `Long`   | Wall-clock time of insertion into note |

#### 3.2.d Local File Creation and Storage Location

**INFERRED:**
- Video file: `/data/user/0/com.coloros.note/files/notes/images/<videoAttachId>.mp4` (path segment speculative; may use a `video/` subdir — **UNKNOWN**)
- Thumbnail: `/data/user/0/com.coloros.note/files/notes/thumb/<uuid>.jpg`

Transcoding or compression before storage: **UNKNOWN**.

#### 3.2.e URI / Path Resolution

**INFERRED** — Similar to images; `videoSrc` normalised from MediaStore URI to private-storage copy. Two attachment IDs (`attachId` vs `videoAttachId`) suggest the video block and the video file are tracked as separate DB rows.

#### 3.2.f Database Records

**STRONGLY SUPPORTED** — Likely two rows:
1. A primary block row (`attachment_id = attachId`, `type = 13`)
2. A media file row (`attachment_id = videoAttachId`, `associate_attachment_id` pointing to the block row)

`width`, `height`, `file_name`, and `url` columns carry video metadata. `associate_attachment_id` relationship: **INFERRED** from two-ID pattern; not directly verified.

#### 3.2.g Preview, Opening, Editing, Deletion, Cleanup

**INFERRED:**
- **Preview:** Poster image (`picSrc`) shown in editor block.
- **Playback:** Native video player launched on tap.
- **Editing:** UNKNOWN; no video-editing bridge handler observed.
- **Deletion:** Both DB rows should be removed; file cleanup timing UNKNOWN.

#### 3.2.h Cloud-Sync Metadata

**INFERRED** — Videos are likely uploaded as binary blobs; size of files may affect sync strategy (chunked upload vs. full). `state` and `cloud_metadata` same pattern as images. Large video handling: **UNKNOWN**.

#### 3.2.i Cross-Platform Portability Assessment

**STRONGLY SUPPORTED** — Non-portable: private-path dependency, two-ID coupling, platform-specific thumbnail format. Duration unit ambiguity complicates import.

---

### 3.3 Voice and Audio Recordings

**Attachment types:** `TYPE_VOICE = 2`, `TYPE_SPEECH_AUDIO = 5`, `TYPE_SPEECH_LRC = 6`, `TYPE_IDENTIFY_VOICE = 11`, `TYPE_IDENTIFY_VOICE_LRC = 12`, `TYPE_EXTERNAL_AUDIO = 14`, `NEW_LRC = 21`, `NEW_MARK = 22`

#### 3.3.a JavaScript Insertion Handler and Payload Schema

**STRONGLY SUPPORTED** — Bridge call: `callInsertRecordCardFromJava` with a `RecordAttr` payload.

```json
{
  "attachId":      "<uuid>",
  "recordId":      "<uuid>",
  "src":           "<local-mp3-path>",
  "fileName":      "recording_20261102.mp3",
  "fileSize":      204800,
  "duration":      30,
  "currentTime":   0,
  "state":         0,
  "title":         "Voice Memo",
  "timeStamp":     1730000000000,
  "fileDate":      1730000000000,
  "hasCallLogs":   false,
  "hasMarks":      false,
  "isAsrAudio":    false,
  "isSpeechAudio": false,
  "isExternal":    false,
  "lrcContent":    null,
  "asrAttachId":   null,
  "picHeight":     0,
  "picWidth":      0
}
```

Update path: `callUpdateRecordStateFromJava` (updates playback state / `currentTime`).

#### 3.3.b Native Bridge Methods

**VERIFIED:**
- `callInsertRecordCardFromJava` — inserts audio card block
- `callUpdateRecordStateFromJava` — updates playback position / state

#### 3.3.c Java/Kotlin Models

##### `RecordAttr` (20 fields, VERIFIED)

| # | Field           | Type      | Notes |
|---|-----------------|-----------|-------|
| 1 | `attachId`      | `String`  | Block-level attachment ID |
| 2 | `recordId`      | `String`  | File-level recording ID |
| 3 | `src`           | `String`  | Local audio file path |
| 4 | `fileName`      | `String`  | Display filename |
| 5 | `fileSize`      | `Long`    | Bytes |
| 6 | `duration`      | `Long`    | Recording duration (unit UNKNOWN — ms or s) |
| 7 | `currentTime`   | `Long`    | Playback position |
| 8 | `state`         | `Int`     | Playback state enum |
| 9 | `title`         | `String`  | User-visible title |
| 10 | `timeStamp`    | `Long`    | Recording timestamp |
| 11 | `fileDate`     | `Long`    | File creation date |
| 12 | `hasCallLogs`  | `Boolean` | Recording includes call-log association |
| 13 | `hasMarks`     | `Boolean` | Recording has bookmark/mark annotations |
| 14 | `isAsrAudio`   | `Boolean` | Is an ASR (speech-to-text) audio file |
| 15 | `isSpeechAudio`| `Boolean` | Part of a speech-recording session |
| 16 | `isExternal`   | `Boolean` | Imported from external source |
| 17 | `lrcContent`   | `String?` | LRC lyrics/transcript content (inline) |
| 18 | `asrAttachId`  | `String?` | Linked ASR transcript attachment ID |
| 19 | `picHeight`    | `Int`     | Waveform / cover image height |
| 20 | `picWidth`     | `Int`     | Waveform / cover image width |

##### `AudioInfo` (13 fields, VERIFIED)

A read-model / display DTO, distinct from `RecordAttr`:

| # | Field            | Type      | Notes |
|---|------------------|-----------|-------|
| 1 | `asrAttachId`    | `String?` | Linked ASR attachment |
| 2 | `currentTime`    | `Long`    | Playback position |
| 3 | `duration`       | `Long`    | Total duration |
| 4 | `fileDate`       | `Long`    | File creation date |
| 5 | `fileName`       | `String`  | Display filename |
| 6 | `fileSize`       | `Long`    | Bytes |
| 7 | `hasCallLogs`    | `Boolean` | Call-log flag |
| 8 | `hasMarks`       | `Boolean` | Mark/annotation flag |
| 9 | `isExternal`     | `Boolean` | External import flag |
| 10 | `lrcContent`    | `String?` | Inline transcript |
| 11 | `lrcSpeech`     | `String?` | UNKNOWN — may be a speech-segment LRC variant |
| 12 | `showAudioCard` | `Boolean` | UI visibility flag |
| 13 | `timeStamp`     | `Long`    | Recording timestamp |

**Note:** `AudioInfo` omits `attachId`, `recordId`, `src`, `state`, `title`, `isAsrAudio`, `isSpeechAudio`, `picHeight`, `picWidth` (present in `RecordAttr`), and adds `lrcSpeech` and `showAudioCard`. The relationship between these two models (whether `AudioInfo` is derived from `RecordAttr` or stored separately) is **INFERRED** but not confirmed.

#### 3.3.d Local File Creation and Storage Location

**STRONGLY SUPPORTED:**
- Audio files: `/data/user/0/com.coloros.note/files/notes/record/`
- Default format: **VERIFIED** — `Attachment.DEFAULT_AUDIO_FORMAT = "mp3"`
- LRC transcript files: **INFERRED** — same directory with `.lrc` extension, linked by `TYPE_SPEECH_LRC = 6` and `asrAttachId`

#### 3.3.e URI / Path Resolution

**INFERRED** — `src` in `RecordAttr` carries the absolute local path. External recordings (`isExternal = true`) may retain a `content://` URI until copied to app storage. `asrAttachId` cross-references the LRC attachment row.

#### 3.3.f Database Records

**VERIFIED** — `attachments` table rows for audio:

| Column              | Notes |
|---------------------|-------|
| `type`              | 2 (VOICE), 5 (SPEECH_AUDIO), 6 (SPEECH_LRC), 11, 12, 14, 21, 22 |
| `associate_attachment_id` | LRC row points back to audio row (INFERRED) |
| `file_name`         | Display filename |
| `url`               | Local path |

**VERIFIED** — `speech_log_info` table provides a richer speech-session record:

| Column               | Notes |
|----------------------|-------|
| `summary_id`         | PK |
| `rich_note_id`       | FK → note |
| `speech_log_id`      | Session ID |
| `contact_cover`      | UNKNOWN — possibly contact avatar path |
| `contact_number`     | Phone number (for call recording) |
| `contact_name`       | Caller/contact name |
| `entity`             | UNKNOWN — JSON blob? |
| `voice_id`           | Primary audio attachment ID |
| `voice_url`          | Audio file URL/path |
| `voice_lrc_id`       | LRC attachment ID |
| `voice_lrc_url`      | LRC file path |
| `flag`               | UNKNOWN bit-field |
| `speech_create_time` | Session creation timestamp |
| `speech_type`        | Session type enum (values UNKNOWN) |
| `pic_id`             | Cover image attachment ID |
| `speech_mark`        | UNKNOWN — bookmark data? |
| `combined_card`      | UNKNOWN — combined display card JSON? |
| `extra_info`         | Overflow JSON blob |

#### 3.3.g Preview, Opening, Editing, Deletion, Cleanup

**INFERRED:**
- **Preview:** Waveform or card thumbnail rendered in JS block.
- **Playback:** In-editor audio player; `callUpdateRecordStateFromJava` drives play/pause/seek.
- **Transcription:** ASR pipeline writes `lrcContent` / creates separate LRC attachment.
- **Marks:** `hasMarks` flag drives a bookmark overlay; `NEW_MARK = 22` type tracks individual marks.
- **Deletion:** Audio + LRC rows + `speech_log_info` rows should all be removed; cascade behavior UNKNOWN.
- **External audio cleanup:** If `isExternal = true`, the original `content://` file is NOT owned by the app; only the copy is deleted.

#### 3.3.h Cloud-Sync Metadata

**INFERRED** — Large audio files likely chunked. LRC/transcript may sync independently (separate `type` values `6`, `21`). `speech_log_info` table rows may sync separately from `attachments` rows. Server deduplication via `md5`. ASR transcript generation may be cloud-side: **UNKNOWN**.

#### 3.3.i Cross-Platform Portability Assessment

**STRONGLY SUPPORTED** — Partially portable for plain MP3 voice memos (`TYPE_VOICE = 2`). Non-portable elements:
- ASR/LRC transcripts tied to OPPO/ColorOS speech service.
- Call-log association (`hasCallLogs`, `contact_number`) requires device telephony data.
- `speech_log_info` table structure is ColorOS-specific.
- Mark/bookmark system (`NEW_MARK = 22`) has no standard interchange format.

---

### 3.4 Paint / Drawing Attachments

**Attachment types:** `TYPE_PAINT = 1`, `TYPE_COVER_PAINT = 4`, `PAINT_TEXT = 16`, `PAINT_ENT = 17`, `PAINT_MIXTURE = 18`, `PAINT_SKIN_BG = 19`, `PAINT_CONTENT = 20`

#### 3.4.a JavaScript Insertion Handler and Payload Schema

**STRONGLY SUPPORTED** — Bridge call: `callInsertNewPaintFromJava` with `PaintInfo` payload.

```json
{
  "attachId":                    "<uuid>",
  "paintId":                     "<uuid>",
  "dataPath":                    "<local-paint-data-path>",
  "imagePath":                   "<rendered-png-path>",
  "textPath":                    "<text-layer-path>",
  "skinBgPath":                  "<skin-bg-path>",
  "skinBgAttachId":              "<uuid-or-null>",
  "mixtureId":                   "<uuid-or-null>",
  "textId":                      "<uuid-or-null>",
  "imageWidth":                  1080,
  "imageHeight":                 1920,
  "newPaintHeight":              1920,
  "backgroundType":              0,
  "visibleRect":                 "0,0,1080,1920",
  "editStartTime":               1730000000000,
  "isCreate":                    true,
  "isEditing":                   false,
  "isNewInserted":               true,
  "isInfoSaved":                 false,
  "isAddNewPaintByCreateNote":   false,
  "addToHistory":                true,
  "textExtra":                   null,
  "topContentInfo":              null,
  "bottomContentInfo":           null
}
```

#### 3.4.b Native Bridge Method

**VERIFIED:** `callInsertNewPaintFromJava`

#### 3.4.c Java/Kotlin Models

##### `PaintInfo` (24 fields, VERIFIED) — Main editor

| # | Field                          | Type      | Notes |
|---|--------------------------------|-----------|-------|
| 1 | `attachId`                     | `String`  | Block-level ID |
| 2 | `paintId`                      | `String`  | Paint session/file ID |
| 3 | `dataPath`                     | `String`  | Path to raw paint data (strokes, layers) |
| 4 | `imagePath`                    | `String`  | Path to rendered flat image (PNG/JPG) |
| 5 | `textPath`                     | `String`  | Path to text-layer data |
| 6 | `skinBgPath`                   | `String`  | Path to skin/background image |
| 7 | `skinBgAttachId`               | `String?` | Attachment ID of the skin background |
| 8 | `mixtureId`                    | `String?` | ID of a mixture-mode paint object |
| 9 | `textId`                       | `String?` | ID of associated text layer |
| 10 | `imageWidth`                  | `Int`     | Canvas width in px |
| 11 | `imageHeight`                 | `Int`     | Canvas height in px |
| 12 | `newPaintHeight`              | `Int`     | Updated height after expansion |
| 13 | `backgroundType`              | `Int`     | Enum: blank, lined, dotted, image, etc. (values UNKNOWN) |
| 14 | `visibleRect`                 | `String`  | Viewport rect "x,y,w,h" |
| 15 | `editStartTime`               | `Long`    | Timestamp when editing began |
| 16 | `isCreate`                    | `Boolean` | First-time creation vs. re-open |
| 17 | `isEditing`                   | `Boolean` | Currently being edited |
| 18 | `isNewInserted`               | `Boolean` | Freshly inserted into note |
| 19 | `isInfoSaved`                 | `Boolean` | Paint data has been flushed to disk |
| 20 | `isAddNewPaintByCreateNote`   | `Boolean` | Created simultaneously with new note |
| 21 | `addToHistory`                | `Boolean` | Should appear in edit history |
| 22 | `textExtra`                   | `String?` | Overflow text metadata JSON |
| 23 | `topContentInfo`              | `String?` | Content above the canvas (mixed-mode) |
| 24 | `bottomContentInfo`           | `String?` | Content below the canvas (mixed-mode) |

##### `PaintAttr` (8 fields, VERIFIED) — Coverpaint variant

| # | Field           | Type      | Notes |
|---|-----------------|-----------|-------|
| 1 | `attachId`      | `String`  | Block-level ID |
| 2 | `paintId`       | `String`  | Paint session ID |
| 3 | `imageSrc`      | `String`  | Path to rendered image |
| 4 | `paintSrc`      | `String`  | Path to raw paint data |
| 5 | `imageWidth`    | `Int`     | Canvas width |
| 6 | `imageHeight`   | `Int`     | Canvas height |
| 7 | `needShowTips`  | `Boolean` | Show onboarding tips overlay |
| 8 | `tips`          | `String?` | Tips content string |

#### 3.4.d Local File Creation and Storage Location

**INFERRED:**
- Raw paint data: `/data/user/0/com.coloros.note/files/notes/paint/<paintId>/data`
- Rendered image: `/data/user/0/com.coloros.note/files/notes/paint/<paintId>/image.png`
- Text layer: `/data/user/0/com.coloros.note/files/notes/paint/<paintId>/text`
- Skin background: `/data/user/0/com.coloros.note/files/notes/paint/<paintId>/skinbg`

Exact directory layout and file extensions: **UNKNOWN**.

#### 3.4.e URI / Path Resolution

**INFERRED** — All paths in `PaintInfo` appear to be absolute local paths. No `content://` URI usage expected since paint data is app-generated. Multiple file artifacts per paint block (data + image + text + bg) require coordinated path resolution.

#### 3.4.f Database Records

**STRONGLY SUPPORTED** — Multiple `attachments` rows per paint block:

| Row purpose        | `type` value | Notes |
|--------------------|-------------|-------|
| Main paint block   | `1` (PAINT) | Primary block row |
| Text layer         | `16` (PAINT_TEXT) | Linked via `associate_attachment_id` |
| Entity/mixed layer | `17` (PAINT_ENT)  | UNKNOWN exact role |
| Mixture object     | `18` (PAINT_MIXTURE) | `mixtureId` cross-ref |
| Skin background    | `19` (PAINT_SKIN_BG) | `skinBgAttachId` cross-ref |
| Rendered content   | `20` (PAINT_CONTENT) | Flat rendered image row |
| Cover paint        | `4` (COVER_PAINT) | Note cover image |

`associate_attachment_id` column links sub-rows to the primary `TYPE_PAINT` row: **INFERRED**.

#### 3.4.g Preview, Opening, Editing, Deletion, Cleanup

**INFERRED:**
- **Preview:** Rendered `imagePath`/`imageSrc` displayed as static image in editor.
- **Editing:** Opens native paint canvas activity; on save, `callInsertNewPaintFromJava` re-fires (or a separate update call) with updated paths and `isCreate = false`.
- **`isEditing` flag:** Prevents concurrent edits from multiple contexts.
- **`addToHistory`:** Suggests undo/redo stack integration.
- **Deletion:** All sub-type rows (16–20) must be cleaned up; directory recursion likely needed.
- **`notInsertIfNextNodeIsPaint`:** Guard in `AttachData` prevents duplicate paint insertion.

#### 3.4.h Cloud-Sync Metadata

**INFERRED** — Multiple files per paint block complicate cloud sync. `isInfoSaved` likely gates upload. Each sub-attachment row syncs independently with its own `state`. Paint data format (proprietary strokes format vs. standard) is **UNKNOWN** — likely a proprietary binary format making cross-app export difficult.

#### 3.4.i Cross-Platform Portability Assessment

**STRONGLY SUPPORTED** — Very low portability:
- Proprietary multi-file paint format with no public spec.
- Up to 6 sub-attachment rows per block.
- `backgroundType` enum values undocumented.
- `topContentInfo` / `bottomContentInfo` mixed-layout format unknown.
- Only the rendered `imagePath` (flat image) would be portable.

---

### 3.5 Document and File Cards

**Attachment type:** `TYPE_FILE_CARD = 10`

#### 3.5.a JavaScript Insertion Handler and Payload Schema

**STRONGLY SUPPORTED** — Bridge call: `callInsertFileCardFromJava` with `FileCardData` payload.

```json
{
  "attachId":       "<uuid>",
  "docAttachId":    "<uuid>",
  "src":            "<thumbnail-path>",
  "docThumbnail":   "<doc-preview-path>",
  "fileName":       "report.pdf",
  "filePath":       "<local-doc-path>",
  "fileUrl":        "<url-or-local-path>",
  "fileType":       "pdf",
  "fileSize":       524288,
  "fileDate":       1730000000000,
  "picWidth":       800,
  "picHeight":      600,
  "searchAttachId": "<uuid-or-null>",
  "searchList":     []
}
```

#### 3.5.b Native Bridge Method

**VERIFIED:** `callInsertFileCardFromJava`

#### 3.5.c Java/Kotlin Model — `FileCardData` (14 fields, VERIFIED)

| # | Field            | Type       | Notes |
|---|------------------|------------|-------|
| 1 | `attachId`       | `String`   | Block-level ID |
| 2 | `docAttachId`    | `String`   | File attachment DB row ID |
| 3 | `src`            | `String`   | Thumbnail image path |
| 4 | `docThumbnail`   | `String`   | Document preview/thumbnail |
| 5 | `fileName`       | `String`   | Display filename |
| 6 | `filePath`       | `String`   | Local file path |
| 7 | `fileUrl`        | `String`   | Remote URL or local URI |
| 8 | `fileType`       | `String`   | Extension or MIME type (e.g. "pdf", "docx") |
| 9 | `fileSize`       | `Long`     | Bytes |
| 10 | `fileDate`      | `Long`     | File creation/modification date |
| 11 | `picWidth`      | `Int`      | Preview image width |
| 12 | `picHeight`     | `Int`      | Preview image height |
| 13 | `searchAttachId`| `String?`  | Attachment ID of extracted search index |
| 14 | `searchList`    | `List<?>?` | Pre-extracted search tokens (UNKNOWN element type) |

#### 3.5.d Local File Creation and Storage Location

**INFERRED:**
- Document copy: Likely copied from source into a `files/` or `docs/` subdirectory — exact path **UNKNOWN**.
- Thumbnail: `/data/user/0/com.coloros.note/files/notes/thumb/<uuid>.<ext>`
- The `filePath` vs `fileUrl` duality suggests: `filePath` = local copy path; `fileUrl` = original remote/external URL.

#### 3.5.e URI / Path Resolution

**INFERRED** — If `fileUrl` is a remote URL, a local copy is made to `filePath`. `searchAttachId` suggests a third associated file (search index) is created and tracked as its own `attachments` row.

#### 3.5.f Database Records

**STRONGLY SUPPORTED** — Likely two or three rows:
1. Block row (`attachId`, `type = 10`)
2. File row (`docAttachId`, `associate_attachment_id → attachId`)
3. Search-index row (`searchAttachId`) — **INFERRED**

`file_name`, `url` (= `filePath`), `cloud_metadata` populated in the file row.

#### 3.5.g Preview, Opening, Editing, Deletion, Cleanup

**INFERRED:**
- **Preview:** `docThumbnail` image shown in editor card block.
- **Opening:** Intent fired to system file viewer / OfficeSuite for `fileType`.
- **Editing:** File is view-only within Notes; editing in external app possible.
- **Search:** `searchList` / `searchAttachId` enables full-text search within Notes; index row deleted on file card removal.
- **Deletion:** File copy, thumbnail, search-index file, and all DB rows should be cleaned up.

#### 3.5.h Cloud-Sync Metadata

**INFERRED** — Large documents may be stored on OPPO cloud with a remote `fileUrl`. `cloud_metadata` encodes sync state. If `fileUrl` is already a remote URL, file may not be re-uploaded (referenced by URL only) — **UNKNOWN**.

#### 3.5.i Cross-Platform Portability Assessment

**STRONGLY SUPPORTED** — Mixed portability:
- The underlying file (PDF, DOCX, etc.) is portable as a binary blob.
- `searchList` index data is app-specific and not portable.
- `fileUrl` may reference OPPO cloud infrastructure, making export without the file copy lossy.
- `fileType` is informal (not guaranteed MIME type), requiring normalisation on import.

---

### 3.6 Contact, Schedule, and Web Cards

**Attachment types:** `TYPE_SPEECH_CONTACT = 7`, `TYPE_SPEECH_SCHEDULE = 8`, `WEB_CARD = 50`

#### 3.6.a JavaScript Insertion Handlers and Payload Schemas

**STRONGLY SUPPORTED:**

##### Contact Card — `callInsertContactCardFromJava`
```json
{
  "attachId":  "<uuid>",
  "src":       "<contact-avatar-path>",
  "cardName":  "Dr. Jane Smith",
  "name":      "Jane Smith",
  "phone":     "+1-555-0100",
  "company":   "Acme Corp",
  "position":  "CEO",
  "picWidth":  200,
  "picHeight": 200,
  "call":      "<deeplink-to-call>",
  "copy":      "<deeplink-to-copy>",
  "save":      "<deeplink-to-save>"
}
```

##### Schedule Card — `callInsertScheduleCardFromJava`
```json
{
  "attachId":  "<uuid>",
  "src":       "<card-preview-image>",
  "cardName":  "Team Meeting",
  "name":      "Team Meeting",
  "time":      "2026-11-03T10:00:00",
  "address":   "Conference Room B",
  "picWidth":  400,
  "picHeight": 200,
  "addEvent":  "<deeplink-to-calendar>",
  "navigate":  "<deeplink-to-maps>",
  "copy":      "<deeplink-to-copy>"
}
```

##### Web / Generic Card — `callInsertCardFromJava`
```json
{
  "attachId":      "<uuid>",
  "url":           "https://example.com/article",
  "deeplink":      "<app-deeplink>",
  "title":         "Article Title",
  "subTitle":      "Article subtitle",
  "content":       "Preview text...",
  "cover":         "<cover-image-url>",
  "packageName":   "com.browser.app",
  "sourceLabel":   "Browser",
  "fromType":      1,
  "contentLoaded": true,
  "error":         false
}
```

#### 3.6.b Native Bridge Methods

**VERIFIED:**
- `callInsertContactCardFromJava`
- `callInsertScheduleCardFromJava`
- `callInsertCardFromJava`

#### 3.6.c Java/Kotlin Models

##### `ContactCardAttr` (12 fields, VERIFIED)

| # | Field       | Type     | Notes |
|---|-------------|----------|-------|
| 1 | `attachId`  | `String` | Block-level ID |
| 2 | `src`       | `String` | Contact avatar/image path |
| 3 | `cardName`  | `String` | Display name on card header |
| 4 | `name`      | `String` | Contact full name |
| 5 | `phone`     | `String` | Primary phone number |
| 6 | `company`   | `String` | Employer/organisation |
| 7 | `position`  | `String` | Job title |
| 8 | `picWidth`  | `Int`    | Avatar image width |
| 9 | `picHeight` | `Int`    | Avatar image height |
| 10 | `call`     | `String` | Deeplink / action URI to initiate call |
| 11 | `copy`     | `String` | Deeplink / action URI to copy contact |
| 12 | `save`     | `String` | Deeplink / action URI to save to contacts |

##### `ScheduleCardAttr` (11 fields, VERIFIED)

| # | Field       | Type     | Notes |
|---|-------------|----------|-------|
| 1 | `attachId`  | `String` | Block-level ID |
| 2 | `src`       | `String` | Card preview image path |
| 3 | `cardName`  | `String` | Event display name |
| 4 | `name`      | `String` | Event name |
| 5 | `time`      | `String` | Event time (format UNKNOWN — ISO 8601 assumed) |
| 6 | `address`   | `String` | Event location/address |
| 7 | `picWidth`  | `Int`    | Preview image width |
| 8 | `picHeight` | `Int`    | Preview image height |
| 9 | `addEvent`  | `String` | Deeplink to add event to calendar |
| 10 | `navigate` | `String` | Deeplink to maps/navigation |
| 11 | `copy`     | `String` | Deeplink to copy event details |

##### `CardAttr` (12 fields, VERIFIED) — Web / Generic card

| # | Field           | Type      | Notes |
|---|-----------------|-----------|-------|
| 1 | `attachId`      | `String`  | Block-level ID |
| 2 | `url`           | `String`  | Source web URL |
| 3 | `deeplink`      | `String`  | App-specific deeplink |
| 4 | `title`         | `String`  | Card title |
| 5 | `subTitle`      | `String`  | Card subtitle |
| 6 | `content`       | `String`  | Preview/excerpt text |
| 7 | `cover`         | `String`  | Cover image URL or path |
| 8 | `packageName`   | `String`  | Source app package name |
| 9 | `sourceLabel`   | `String`  | Human-readable source label |
| 10 | `fromType`     | `Int`     | Origin type enum (values UNKNOWN) |
| 11 | `contentLoaded`| `Boolean` | Whether preview content is ready |
| 12 | `error`        | `Boolean` | Whether card failed to load |

#### 3.6.d Local File Creation and Storage Location

**INFERRED:**
- Contact avatar: Copied from Android Contacts provider to app-private storage; exact path UNKNOWN.
- Schedule card preview: Generated screenshot or fetched thumbnail; path UNKNOWN.
- Web card cover: Downloaded from `cover` URL; UNKNOWN whether cached persistently or fetched on demand.
- No audio/document files involved for these card types.

#### 3.6.e URI / Path Resolution

**INFERRED:**
- `src` fields carry local paths for cached avatars/previews.
- `call`, `copy`, `save`, `addEvent`, `navigate` in contact/schedule cards are action URIs (likely Android `Intent` URI scheme) — not file paths.
- `deeplink` in `CardAttr` is an app-specific scheme URI; resolution depends on the source app being installed.

#### 3.6.f Database Records

**STRONGLY SUPPORTED** — One `attachments` row per card:

| Card type         | `type` value | Key DB fields |
|-------------------|-------------|---------------|
| Contact card      | `7`          | `url` = avatar path, `file_name` = contact name |
| Schedule card     | `8`          | `url` = preview path, `extra` = event JSON (INFERRED) |
| Web card          | `50`         | `url` = source URL, `extra` = card JSON (INFERRED) |

`extra` column likely stores the full card payload as a JSON blob for all three types: **INFERRED**.

#### 3.6.g Preview, Opening, Editing, Deletion, Cleanup

**INFERRED:**
- **Preview:** JS renders card UI from the serialised payload.
- **Actions:** Deeplinks / action URIs dispatched via Android `Intent` on user tap.
- **Editing:** Cards are likely read-only once inserted; no edit bridge handler observed for these types.
- **Web card error state:** `error = true` triggers an error-state UI in the card block.
- **Deletion:** DB row deleted; cached avatar/preview image may be cleaned up — timing UNKNOWN.
- **Deeplink validity:** Contact/calendar deeplinks become stale if the source contact or event is deleted from the device.

#### 3.6.h Cloud-Sync Metadata

**INFERRED:**
- Contact and schedule cards store device-local deeplinks — these are inherently not portable across devices.
- Web card `url` is portable but `deeplink` (app-specific) is not.
- `cloud_metadata` and `state` columns present for these types — sync behavior UNKNOWN.
- Avatar images cached locally would need to be uploaded for cloud sync.

#### 3.6.i Cross-Platform Portability Assessment

**STRONGLY SUPPORTED** — Very low portability:

| Card type    | Portable element         | Non-portable element |
|--------------|--------------------------|----------------------|
| Contact card | Name, phone, company     | Action deeplinks, avatar path, `picWidth`/`picHeight` |
| Schedule card| Event name, time, address| Calendar/maps deeplinks, `fromType` enum |
| Web card     | `url`, `title`, `content`| `deeplink`, `packageName`, `fromType`, cached `cover` |

---

## 4. Summary Table — All 23 Attachment Type Constants

| Constant Name              | Value | Category             | Portability        | Confidence |
|----------------------------|-------|----------------------|--------------------|------------|
| `TYPE_PICTURE`             | 0     | Image                | Low                | VERIFIED   |
| `TYPE_PAINT`               | 1     | Paint/Drawing        | Very Low           | VERIFIED   |
| `TYPE_VOICE`               | 2     | Audio/Voice          | Medium (MP3)       | VERIFIED   |
| `TYPE_COVER_PICTURE`       | 3     | Image (cover)        | Low                | VERIFIED   |
| `TYPE_COVER_PAINT`         | 4     | Paint (cover)        | Very Low           | VERIFIED   |
| `TYPE_SPEECH_AUDIO`        | 5     | Audio/Speech         | Low                | VERIFIED   |
| `TYPE_SPEECH_LRC`          | 6     | Audio transcript     | Very Low           | VERIFIED   |
| `TYPE_SPEECH_CONTACT`      | 7     | Contact card         | Very Low           | VERIFIED   |
| `TYPE_SPEECH_SCHEDULE`     | 8     | Schedule card        | Very Low           | VERIFIED   |
| `TYPE_LRC_PICTURE`         | 9     | Image (LRC/ASR)      | Low                | VERIFIED   |
| `TYPE_FILE_CARD`           | 10    | File/Document        | Medium (file blob) | VERIFIED   |
| `TYPE_IDENTIFY_VOICE`      | 11    | Voice (identified)   | Low                | VERIFIED   |
| `TYPE_IDENTIFY_VOICE_LRC`  | 12    | Voice transcript     | Very Low           | VERIFIED   |
| `TYPE_VIDEO`               | 13    | Video                | Medium (MP4)       | VERIFIED   |
| `TYPE_EXTERNAL_AUDIO`      | 14    | External audio       | Medium (MP3/M4A)   | VERIFIED   |
| `TYPE_HR`                  | 15    | UNKNOWN (divider?)   | UNKNOWN            | VERIFIED   |
| `PAINT_TEXT`               | 16    | Paint sub-layer      | Very Low           | VERIFIED   |
| `PAINT_ENT`                | 17    | Paint sub-layer      | Very Low           | VERIFIED   |
| `PAINT_MIXTURE`            | 18    | Paint sub-layer      | Very Low           | VERIFIED   |
| `PAINT_SKIN_BG`            | 19    | Paint background     | Very Low           | VERIFIED   |
| `PAINT_CONTENT`            | 20    | Paint rendered image | Low (image export) | VERIFIED   |
| `NEW_LRC`                  | 21    | New transcript format| Very Low           | VERIFIED   |
| `NEW_MARK`                 | 22    | Audio bookmark       | Very Low           | VERIFIED   |
| `WEB_CARD`                 | 50    | Web/generic card     | Low (URL only)     | VERIFIED   |

> [!NOTE]
> `TYPE_HR = 15` purpose is UNKNOWN. The name suggests a horizontal rule / divider (a non-media structural element), but this has not been confirmed from source. If it is purely structural, it may carry no file artifact and have trivial portability.

---

## 5. Portability Impact Summary

### 5.1 Portability by Category

| Category                        | Overall Rating | Primary Blockers |
|---------------------------------|---------------|------------------|
| Plain image (TYPE_PICTURE)      | **Low**       | Private-path URIs, isAiKit server dependency |
| Video (TYPE_VIDEO)              | **Medium**    | Dual-ID coupling, thumbnail format |
| Voice memo (TYPE_VOICE)         | **Medium**    | Plain MP3; filename convention non-standard |
| Speech/ASR audio                | **Very Low**  | OPPO speech service, LRC format, call-log data |
| Paint/drawing                   | **Very Low**  | Proprietary multi-file format; only flat render portable |
| File card                       | **Medium**    | File blob portable; search index and cloud URL non-portable |
| Contact card                    | **Very Low**  | Deeplinks device-specific; data could be vCard-exported |
| Schedule card                   | **Very Low**  | Deeplinks device-specific; data could be iCal-exported |
| Web card                        | **Low**       | URL portable; deeplink and cached cover not portable |

### 5.2 Fields Identified as Portability Risks Across All Types

1. **Private storage paths** — All `src`, `filePath`, `dataPath`, `imagePath`, `videoSrc` fields reference `/data/user/0/com.coloros.note/…` which is inaccessible without root or backup extraction.
2. **Action / deeplink URIs** — `call`, `save`, `addEvent`, `navigate`, `deeplink` fields use device-local Android Intent URI schemes.
3. **ASR / speech service dependencies** — `asrAttachId`, `lrcContent`, `isSpeechAudio`, `isAsrAudio`, `speech_log_info` table require OPPO's ASR infrastructure.
4. **Multi-row paint sub-attachments** — Up to 6 `attachments` rows per paint block in a proprietary format.
5. **`cloud_metadata` JSON schema** — Contents unknown; likely references OPPO cloud endpoints that are not public.
6. **Enum values without documentation** — `backgroundType`, `fromType`, `speech_type`, `flag` in `speech_log_info`; numeric values without a key schema.
7. **`searchList` / `searchAttachId`** — App-internal search index with unknown serialisation format.

### 5.3 Recommended Export Strategy (INFERRED)

For a maximum-fidelity export of ColorOS Notes attachments:

| Type             | Recommended Export Format |
|------------------|--------------------------|
| Images           | Copy raw file (JPEG/PNG/WEBP) |
| Video            | Copy raw video file (MP4) |
| Voice (plain)    | Copy MP3 file |
| Speech audio     | MP3 + LRC file; discard ASR metadata |
| Paint            | Export `PAINT_CONTENT` rendered image; raw data non-portable |
| File card        | Copy original file; preserve filename and fileType |
| Contact card     | Synthesise vCard from name/phone/company/position |
| Schedule card    | Synthesise iCalendar event from name/time/address |
| Web card         | Preserve URL + title + content; discard deeplink |

---

## 6. Open Questions and Future Investigation Targets

| # | Question | Priority |
|---|----------|----------|
| 1 | What is `TYPE_HR = 15`? Is it a divider element with no file artifact? | Medium |
| 2 | What are the valid values and semantics of `backgroundType` in `PaintInfo`? | High |
| 3 | What is the exact directory structure under `notes/paint/<paintId>/`? | High |
| 4 | What does the `extra` column in the `attachments` table contain for each type? | High |
| 5 | What is the `cloud_metadata` JSON schema? | High |
| 6 | Is `associate_attachment_id` used as a FK to link sub-paint rows? | High |
| 7 | What is the `entity` column in `speech_log_info`? | Medium |
| 8 | Is `duration` in `VideoData` / `RecordAttr` stored in milliseconds or seconds? | Medium |
| 9 | Does `TYPE_HR` generate any `attachments` DB row? | Medium |
| 10 | What is the `combined_card` column in `speech_log_info`? | Medium |
| 11 | Are video files copied to app-private storage or referenced from MediaStore? | High |
| 12 | Does the web card cover image (`cover` in `CardAttr`) get cached locally? | Low |
| 13 | What `fromType` values exist for `CardAttr`, and what do they map to? | Low |
| 14 | Is there a `callUpdatePaintFromJava` bridge handler for paint updates? | Medium |
| 15 | What is the relationship between `AudioInfo` and `RecordAttr` at runtime? | Medium |

---

*Document generated as part of REA Phase 1 (Static Analysis). All VERIFIED claims derive from decompiled ColorOS Notes source artifacts. All INFERRED claims require corroboration from dynamic analysis or additional decompiled classes.*
