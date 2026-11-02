# Database Layer Implementation & Room v47 Schema Resolution

| Field | Value |
|---|---|
| **Status** | IMPLEMENTATION SPECIFICATION — Milestone 3 Deliverable |
| **Date** | 2026-11-02 |
| **Target Engine** | SQLite3 (via `sqlite3` / `drift`) with WAL Concurrency |
| **Schema Target** | AndroidX Room Version 47 (`nearme_note.db`) |
| **Discrepancy Resolution**| `rich_notes` contains **EXACTLY 49 columns** (audited from `AppDatabase_Impl.java`) |

---

## 1. Resolution of the 48 vs. 49 `rich_notes` Column Discrepancy

### The Audit
An audit was conducted directly against the decompiled Room database bytecode in `apk-work/jadx-out/sources/com/nearme/note/db/AppDatabase_Impl.java` (lines 142–180).

### Decompiled Room v47 DDL Statement
```sql
CREATE TABLE IF NOT EXISTS `rich_notes` (
    `local_id` TEXT NOT NULL,
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
    `state` INTEGER NOT NULL DEFAULT 0,
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
    PRIMARY KEY(`local_id`),
    FOREIGN KEY(`folder_id`) REFERENCES `folders`(`guid`) ON UPDATE CASCADE ON DELETE SET DEFAULT
);
```

### Complete 49-Column Catalog

| # | Column Name | Type | Constraints | Default | Role & Semantic Meaning |
|---|---|---|---|---|---|
| 1 | `local_id` | TEXT | NOT NULL, PRIMARY KEY | None | Local client UUID for the note |
| 2 | `global_id` | TEXT | Nullable | None | Server-side UUID for cloud sync |
| 3 | `text` | TEXT | NOT NULL | None | Body text extracted from TipTap |
| 4 | `raw_text` | TEXT | NOT NULL | None | Unformatted raw body text |
| 5 | `html_text` | TEXT | NOT NULL | None | Full serialized HTML content |
| 6 | `folder_id` | TEXT | NOT NULL, FK | `'00000000_...'` | Foreign key to `folders(guid)` |
| 7 | `timestamp` | INTEGER | NOT NULL | None | Note sorting / creation timestamp |
| 8 | `create_time` | INTEGER | NOT NULL | None | Creation timestamp (UTC ms) |
| 9 | `update_time` | INTEGER | NOT NULL | None | Last modified timestamp (UTC ms) |
| 10 | `top_time` | INTEGER | NOT NULL | `0` | Pin to top timestamp (0 = unpinned) |
| 11 | `recycle_time` | INTEGER | NOT NULL | `0` | Trash timestamp (0 = active) |
| 12 | `alarm_time` | INTEGER | NOT NULL | `0` | Reminder alarm timestamp |
| 13 | `state` | INTEGER | NOT NULL | `0` | Sync state: 0=New, 1=Synced, 2=Modified |
| 14 | `deleted` | INTEGER | NOT NULL | `0` | Soft delete flag: 0=Active, 1=Trash |
| 15 | `skin_id` | TEXT | NOT NULL | `'default'` | Background skin / theme identifier |
| 16 | `title` | TEXT | Nullable | None | Display title extracted from title node |
| 17 | `raw_title` | TEXT | Nullable | None | Unformatted raw title |
| 18 | `recycle_time_pre` | INTEGER | Nullable | `0` | Previous recycle timestamp |
| 19 | `alarm_time_pre` | INTEGER | Nullable | `0` | Previous alarm timestamp |
| 20 | `skin_id_pre` | TEXT | Nullable | None | Previous skin identifier |
| 21 | `extra` | TEXT | Nullable | None | JSON metadata |
| 22 | `version` | INTEGER | NOT NULL | `1` | Schema revision |
| 23 | `is_local` | INTEGER | NOT NULL | `1` | Local-only flag |
| 24 | `is_preset` | INTEGER | NOT NULL | `0` | Built-in guide note flag |
| 25 | `from_package` | TEXT | Nullable | None | Origin package for share intents |
| 26 | `web_notes` | TEXT | Nullable | None | Web clip metadata |
| 27 | `sysVersion` | INTEGER | Nullable | `1` | ColorOS system version |
| 28 | `encrypted` | INTEGER | NOT NULL | `0` | Note-level encryption flag |
| 29 | `encrypted_pre` | INTEGER | NOT NULL | `0` | Previous encryption flag |
| 30 | `encryptSysVersion`| INTEGER | Nullable | None | Encryption algorithm revision |
| 31 | `attachment_extra`| TEXT | Nullable | None | Auxiliary attachment metadata |
| 32 | `summary_title` | TEXT | Nullable | None | AI summary title |
| 33 | `summary_content` | TEXT | Nullable | None | AI summary generated text |
| 34 | `summary_phone_name`| TEXT | Nullable | None | Contact name associated with call log |
| 35 | `summary_phone_number`| TEXT| Nullable | None | Phone number associated with call log |
| 36 | `summary_attachment`| TEXT | Nullable | None | Summary attachment payload |
| 37 | `summary_attachment_size`| INTEGER| NOT NULL| `0` | Summary attachment byte size |
| 38 | `summary_speech_flag`| INTEGER | NOT NULL | `0` | Voice transcription presence flag |
| 39 | `summary_speech_type`| INTEGER | NOT NULL | `0` | Voice transcription type |
| 40 | `summary_show_icon` | INTEGER | NOT NULL | `0` | Header icon display flag |
| 41 | `summary_note_type_flag`| INTEGER| NOT NULL | `0` | Summary category flag |
| 42 | `is_cover_paint_not_char_count`| INTEGER| NOT NULL| `0` | Paint cover word count exemption |
| 43 | `is_summary_edit`| INTEGER | NOT NULL | `0` | Manual summary edit flag |
| 44 | `is_paint_pic` | INTEGER | NOT NULL | `0` | Paint preview picture flag |
| 45 | `summary_version` | INTEGER | NOT NULL | `0` | Summary algorithm revision |
| 46 | `all_attachment_file_name`| TEXT| Nullable | None | Comma-separated attachment filenames |
| 47 | `attachment_lrc` | TEXT | Nullable | None | Inline synchronized LRC lyrics text |
| 48 | `sys_protocol_version`| INTEGER| NOT NULL | `1` | Wire protocol version |
| 49 | `file_download_time` | INTEGER| NOT NULL | `0` | Cloud download completion timestamp |

### Why Previous Reports Stated "48 Columns"
An automated regex script split the table text between the first comma after `local_id` and the primary key clause. Column 1 (`local_id`) was omitted from the count and treated as the primary key declaration `PRIMARY KEY(local_id)`. The audited reality is that `rich_notes` contains **49 declared column definitions**.

---

## 2. Foreign Key & Cascading Deletion Verification

In `SchemaRoomV47`:
```sql
CREATE TABLE IF NOT EXISTS `attachments` (
    `attachment_id` TEXT NOT NULL PRIMARY KEY,
    `rich_note_id` TEXT NOT NULL,
    ...
    FOREIGN KEY(`rich_note_id`) REFERENCES `rich_notes`(`local_id`) ON UPDATE CASCADE ON DELETE CASCADE
);
```

When `PRAGMA foreign_keys = ON;` is set:
- Inserting an attachment referencing a non-existent `rich_note_id` throws an `SqliteException: FOREIGN KEY constraint failed`.
- Deleting a row from `rich_notes` (`DELETE FROM rich_notes WHERE local_id = '...'`) automatically purges all child attachment rows in the same transaction. This was verified in `test_runner/test_database.py`.

---

## 3. Concurrency via Write-Ahead Logging (WAL)

To prevent UI thread auto-save operations from blocking background search indexers or future sync operations:
```sql
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA busy_timeout = 5000;
```
- **Readers do not block writers**: UI reads execute simultaneously while the 500ms debounced auto-save writes to the database.
- **Writers do not block readers**: Search indexing queries never freeze during active note typing.
- Tested and verified: SQLite 3.54 confirms `journal_mode = WAL`.
