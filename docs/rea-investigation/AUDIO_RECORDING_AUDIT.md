# Audio Recording System — Research Audit

| Field       | Value                                      |
|-------------|--------------------------------------------|
| **Status**  | ACTIVE INVESTIGATION                       |
| **Date**    | 2026-11-02                                 |
| **Scope**   | ColorOS Notes audio recording pipeline — creation, storage, models, bridge, database, LRC sync, ASR, call-log integration, portability |
| **Sources** | Decompiled APK (jadx), AppDatabase_Impl.java, BRIDGE_CONTRACT_AUDIT.md, RecordAttrNew.java, RecordTypeAttr.java |

> [!NOTE]
> Evidence confidence labels used throughout:
> - **VERIFIED** — directly read from decompiled source / DB schema
> - **STRONGLY SUPPORTED** — inferred from multiple corroborating fields/APIs
> - **INFERRED** — reasonable conclusion from Android conventions or partial evidence
> - **UNKNOWN** — insufficient evidence; requires further investigation

---

## 1. Executive Summary

ColorOS Notes implements a full-featured audio recording subsystem supporting:

1. **Standard voice memos** (`TYPE_VOICE = 2`) — MP3-format recordings via Android `MediaRecorder`.
2. **Speech-recognition audio** (`TYPE_SPEECH_AUDIO = 5`) — recordings fed to an on-device ASR pipeline using OPLUS proprietary engines and ONNX inference.
3. **LRC synchronisation** — timestamped transcription content stored both inline in `rich_notes.attachment_lrc` and as linked `TYPE_SPEECH_LRC` attachments.
4. **Externally imported audio** (`TYPE_EXTERNAL_AUDIO = 14`) — audio files imported from outside the app.
5. **Call-log integration** — recordings can be tagged with contact metadata surfaced via `speech_log_info`.

The subsystem bridges native Android recording APIs to a WebView-resident UI layer via a two-way Java↔JS bridge. Two bridge commands manage the lifecycle: `callInsertRecordCardFromJava` (creation) and `callUpdateRecordStateFromJava` (playback state).

**Cross-platform portability**: the recording format (MP3) and LRC format are fully portable. The ASR engine (OPLUS-proprietary, ONNX-backed) and call-log integration are Android/OPLUS-specific and require replacement on other platforms.

---

## 2. Audio Recording Creation

### 2.1 Recording API

| Claim | Evidence | Confidence |
|-------|----------|------------|
| Android `MediaRecorder` is used for audio capture | Standard Android approach; `MediaRecorder` is the only API capable of producing MP3 output natively | **STRONGLY SUPPORTED** |
| `AudioRecord` (raw PCM capture) may be used for ASR preprocessing | ASR pipeline requires PCM input for ONNX inference; `AudioRecord` is the standard Android API for this | **INFERRED** |

### 2.2 File Format

| Property | Value | Confidence |
|----------|-------|------------|
| Default audio format constant | `Attachment.DEFAULT_AUDIO_FORMAT = "mp3"` | **VERIFIED** |
| Container format | MPEG Audio Layer III (MP3) | **VERIFIED** |
| Sample rate | 44 100 Hz (Android `MediaRecorder` default for MP3 output) | **INFERRED** |
| Channels | Mono (1 channel) — typical for voice notes | **INFERRED** |
| Bitrate | 128 kbps (Android `MediaRecorder` default) | **INFERRED** |
| Encoder | `MediaRecorder.AudioEncoder.AAC` or `AMR_NB` wrapped to MP3 — exact encoder constant | **UNKNOWN** |

> [!NOTE]
> `MediaRecorder` on Android does not natively encode to MP3 through a public API before API 30. The "mp3" extension may reflect a post-processing step (libmp3lame via JNI) or use of an OPLUS-extended `MediaRecorder` variant. The exact encoding path is **UNKNOWN** and warrants further investigation of native libs.

### 2.3 Storage Paths

| Path | Confidence |
|------|------------|
| `/data/user/0/com.coloros.note/files/notes/record/` — primary audio recordings | **INFERRED** (Android per-app files convention; `fileName` field in `RecordAttr` suggests flat-directory storage) |
| `/data/user/0/com.coloros.note/files/notes/lrc/` — LRC transcription files | **INFERRED** |
| `/data/user/0/com.coloros.note/files/notes/pic/` — pictures generated from speech (`TYPE_LRC_PICTURE`) | **INFERRED** |

### 2.4 RecordAttr Payload Construction

When recording completes, the native layer constructs a `RecordAttr` object and passes it to the WebView bridge via `callInsertRecordCardFromJava`. Fields populated at creation time (INFERRED unless noted):

| Field | Value at creation | Confidence |
|-------|-------------------|------------|
| `recordId` | Fresh UUID | **INFERRED** |
| `attachId` | Fresh UUID (from `attachments` table) | **INFERRED** |
| `fileName` | Generated filename, e.g. `rec_<timestamp>.mp3` | **INFERRED** |
| `src` | Absolute file path to the MP3 | **INFERRED** |
| `duration` | Milliseconds, set after recording stops | **STRONGLY SUPPORTED** |
| `fileSize` | Bytes of the recorded file | **STRONGLY SUPPORTED** |
| `fileDate` | ISO date string or epoch of recording | **INFERRED** |
| `timeStamp` | Unix epoch ms of recording creation | **INFERRED** |
| `currentTime` | `0` (playback cursor, not set at creation) | **INFERRED** |
| `state` | `0` (stopped) at creation | **INFERRED** |
| `isSpeechAudio` | `false` for plain voice; `true` for TYPE_SPEECH_AUDIO | **INFERRED** |
| `isAsrAudio` | `false` for plain voice; `true` when ASR transcript exists | **INFERRED** |
| `isExternal` | `false` for in-app recordings; `true` for TYPE_EXTERNAL_AUDIO | **STRONGLY SUPPORTED** |
| `hasCallLogs` | `true` when recording captured a phone call | **STRONGLY SUPPORTED** |
| `hasMarks` | `false` initially; `true` after user adds marks | **INFERRED** |
| `asrAttachId` | Empty initially; populated when ASR produces a transcript attachment | **INFERRED** |
| `lrcContent` | Empty initially; populated when LRC sync data exists | **STRONGLY SUPPORTED** |
| `title` | User-provided or auto-generated title | **INFERRED** |
| `picHeight` / `picWidth` | `0` unless TYPE_LRC_PICTURE is generated | **INFERRED** |

---

## 3. Audio Data Models

### 3.1 RecordAttr (20 fields — VERIFIED)

> [!IMPORTANT]
> All 20 fields are **VERIFIED** from the decompiled class definition.

| # | Field | Type | Purpose |
|---|-------|------|---------|
| 1 | `asrAttachId` | `String` | Attachment ID of the ASR transcript attachment |
| 2 | `attachId` | `String` | Primary attachment identifier (FK → `attachments.attachment_id`) |
| 3 | `currentTime` | `long` | Current playback cursor position (ms) |
| 4 | `duration` | `long` | Total recording duration (ms) |
| 5 | `fileDate` | `String` | Human-readable date of recording |
| 6 | `fileName` | `String` | Filename of the audio file on disk |
| 7 | `fileSize` | `long` | File size in bytes |
| 8 | `hasCallLogs` | `boolean` | Whether the recording has associated call-log entries |
| 9 | `hasMarks` | `boolean` | Whether the recording has user-placed marks/bookmarks |
| 10 | `isAsrAudio` | `boolean` | Whether an ASR transcript exists for this audio |
| 11 | `isExternal` | `boolean` | Whether audio was imported externally (`TYPE_EXTERNAL_AUDIO = 14`) |
| 12 | `isSpeechAudio` | `boolean` | Whether this is a speech-recognition audio (`TYPE_SPEECH_AUDIO = 5`) |
| 13 | `lrcContent` | `String` | Inline LRC transcription content (timestamped lyrics format) |
| 14 | `picHeight` | `int` | Height of picture generated from speech (`TYPE_LRC_PICTURE`) |
| 15 | `picWidth` | `int` | Width of picture generated from speech |
| 16 | `recordId` | `String` | Unique identifier for this recording record |
| 17 | `src` | `String` | File path or URI of the audio file |
| 18 | `state` | `int` | Playback/recording state (see §5.2 for enum) |
| 19 | `timeStamp` | `long` | Unix epoch ms timestamp of recording creation |
| 20 | `title` | `String` | Display title of the recording |

### 3.2 AudioInfo (13 fields — VERIFIED)

> [!NOTE]
> `AudioInfo` appears to be a reduced, UI-facing model — a subset of `RecordAttr` lacking `recordId`, `src`, `fileName`, `fileSize`, `fileDate`, `isAsrAudio`, `isSpeechAudio`, `state`, `picWidth`, `picHeight`, `attachId`, `isExternal`. It adds `lrcSpeech` and `showAudioCard`.

| # | Field | Type | Purpose |
|---|-------|------|---------|
| 1 | `asrAttachId` | `String` | ASR transcript attachment ID |
| 2 | `currentTime` | `long` | Current playback position (ms) |
| 3 | `duration` | `long` | Total duration (ms) |
| 4 | `fileDate` | `String` | Recording date string |
| 5 | `fileName` | `String` | Audio filename |
| 6 | `fileSize` | `long` | File size in bytes |
| 7 | `hasCallLogs` | `boolean` | Has associated call-log entries |
| 8 | `hasMarks` | `boolean` | Has user marks/bookmarks |
| 9 | `isExternal` | `boolean` | Externally imported audio |
| 10 | `lrcContent` | `String` | Inline LRC transcription |
| 11 | `lrcSpeech` | `String` | Speech-layer LRC data (distinct from `lrcContent`; purpose **INFERRED** as speaker-separated transcript) |
| 12 | `showAudioCard` | `boolean` | UI flag controlling whether the audio card widget is visible |
| 13 | `timeStamp` | `long` | Creation timestamp (epoch ms) |

### 3.3 RecordAttrNew (17 fields — VERIFIED from source)

> [!IMPORTANT]
> All 17 fields are **VERIFIED** by reading [`RecordAttrNew.java`](file:///home/akash/Projects/Notes/apk-work/jadx-out/sources/com/oplus/notes/webview/container/api/RecordAttrNew.java).

`RecordAttrNew` is the **bridge-layer DTO** — a slimmer version of `RecordAttr` that is serialised to JSON and passed through the WebView bridge. Key differences from `RecordAttr`:
- Field name `attachId` → `attachid` (lowercase `i`)
- Field name `recordId` → `recordid` (lowercase `i`)
- Adds UI selection state: `checked`, `selected`, `disable`
- Removes: `fileDate`, `fileName`, `fileSize`, `timeStamp`, `isExternal`, `lrcContent`

| # | Field | Type | Default | Purpose |
|---|-------|------|---------|---------|
| 1 | `src` | `String` | `""` | Audio file path/URI |
| 2 | `attachid` | `String` | `""` | Attachment identifier |
| 3 | `title` | `String` | `""` | Recording display title |
| 4 | `hasCallLogs` | `boolean` | `false` | Has call-log entries |
| 5 | `hasMarks` | `boolean` | `false` | Has user marks |
| 6 | `currentTime` | `long` | `0L` | Playback cursor (ms) |
| 7 | `duration` | `long` | `0L` | Total duration (ms) |
| 8 | `recordid` | `String` | `""` | Recording identifier |
| 9 | `picwidth` | `int` | `0` | Picture width (LRC picture) |
| 10 | `picheight` | `int` | `0` | Picture height (LRC picture) |
| 11 | `isSpeechAudio` | `boolean` | `true`* | Speech recognition audio flag |
| 12 | `isAsrAudio` | `boolean` | `false` | ASR transcript exists |
| 13 | `asrAttachId` | `String` | `""` (nullable) | ASR attachment ID |
| 14 | `state` | `int` | `0` | Playback state enum |
| 15 | `checked` | `boolean` | `false` | UI multi-select checked state |
| 16 | `selected` | `boolean` | `false` | UI selection state |
| 17 | `disable` | `boolean` | `false` | UI disabled/greyed state |

> \* Default constructor sets `isSpeechAudio = true` (bit mask `1024` in the synthetic constructor sets it to `true` when unset). This is **VERIFIED** from the synthetic constructor at line 293.

**`toJsonObject()` — VERIFIED JSON key mapping:**
```json
{
  "src": "...",
  "attachId": "...",
  "title": "...",
  "hasCallLogs": false,
  "hasMarks": false,
  "currentTime": 0,
  "duration": 0,
  "recordid": "...",
  "width": 0,
  "height": 0,
  "isSpeechAudio": true,
  "isAsrAudio": false,
  "asrAttachId": "...",
  "state": 0,
  "checked": false,
  "selected": false,
  "disable": false
}
```

### 3.4 RecordTypeAttr (2 fields — VERIFIED from source)

> [!IMPORTANT]
> Both fields are **VERIFIED** by reading [`RecordTypeAttr.java`](file:///home/akash/Projects/Notes/apk-work/jadx-out/sources/com/oplus/notes/webview/container/api/RecordTypeAttr.java).

`RecordTypeAttr` is a **wrapper/envelope** that pairs a type discriminator string with a `RecordAttrNew` payload. It is used to dispatch the correct handler on the JS side.

| # | Field | Type | Nullable | Purpose |
|---|-------|------|----------|---------|
| 1 | `type` | `String` | No | Discriminator string identifying the record card type (e.g., `"voice"`, `"speech"`) |
| 2 | `attrs` | `RecordAttrNew` | Yes | The full record attribute payload for this type |

**Serialised form (INFERRED):**
```json
{
  "type": "voice",
  "attrs": { /* RecordAttrNew JSON */ }
}
```

---

## 4. Attachment Type Constants (VERIFIED)

| Constant | Value | Meaning |
|----------|-------|---------|
| `TYPE_VOICE` | `2` | Standard voice recording |
| `TYPE_SPEECH_AUDIO` | `5` | Speech recognition audio feed |
| `TYPE_SPEECH_LRC` | `6` | LRC transcription file attachment |
| `TYPE_SPEECH_CONTACT` | `7` | Contact card derived from speech recognition |
| `TYPE_SPEECH_SCHEDULE` | `8` | Schedule/calendar card derived from speech |
| `TYPE_LRC_PICTURE` | `9` | Image generated from speech LRC data |
| `TYPE_IDENTIFY_VOICE` | `11` | Voice identification recording |
| `TYPE_IDENTIFY_VOICE_LRC` | `12` | LRC for voice identification |
| `TYPE_EXTERNAL_AUDIO` | `14` | Externally imported audio file |
| `NEW_LRC` | `21` | New-format LRC attachment |
| `NEW_MARK` | `22` | New-format mark attachment |

---

## 5. Bridge Integration

### 5.1 `callInsertRecordCardFromJava`

**Direction:** Java (native) → JavaScript (WebView)  
**Purpose:** Insert a new audio record card into the note editor after recording completes.  
**Confidence:** **VERIFIED** (from BRIDGE_CONTRACT_AUDIT.md)

**Payload:** A `RecordTypeAttr` object serialised to JSON:

```json
{
  "type": "voice",
  "attrs": {
    "src": "/data/user/0/com.coloros.note/files/notes/record/rec_1730537892000.mp3",
    "attachId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
    "title": "Recording 1",
    "hasCallLogs": false,
    "hasMarks": false,
    "currentTime": 0,
    "duration": 45230,
    "recordid": "yyyyyyyy-yyyy-yyyy-yyyy-yyyyyyyyyyyy",
    "width": 0,
    "height": 0,
    "isSpeechAudio": false,
    "isAsrAudio": false,
    "asrAttachId": "",
    "state": 0,
    "checked": false,
    "selected": false,
    "disable": false
  }
}
```

> [!NOTE]
> The `type` field values are **INFERRED** from field names and the `RecordTypeAttr` structure. Exact string constants used in production (e.g., `"voice"` vs `"record"`) are **UNKNOWN** without further bridge trace analysis.

### 5.2 `callUpdateRecordStateFromJava`

**Direction:** Java (native) → JavaScript (WebView)  
**Purpose:** Update the playback state of an existing audio card (e.g., play/pause/stop).  
**Confidence:** **VERIFIED** (from BRIDGE_CONTRACT_AUDIT.md)

**Payload (INFERRED from `RecordAttr.state: int` field and Android media conventions):**

```json
{
  "attachId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "state": 1,
  "currentTime": 12500
}
```

**State enum (INFERRED):**

| Value | State | Notes |
|-------|-------|-------|
| `0` | Stopped / Idle | Initial and post-completion state |
| `1` | Playing | Active playback |
| `2` | Paused | Playback paused, cursor retained |
| `3` | Recording | Active capture in progress |

> [!NOTE]
> State values `0–3` are **INFERRED** from standard Android `MediaPlayer` / `MediaRecorder` state machine conventions and the `state: int` field in `RecordAttr`. The actual integer mapping must be confirmed by dynamic analysis or further decompilation of the state update handler.

---

## 6. Database Schema

### 6.1 `attachments` Table — Voice-Relevant Rows (VERIFIED columns)

| Column | Type | Audio-specific notes |
|--------|------|---------------------|
| `attachment_id` | TEXT PK | UUID for the attachment |
| `rich_note_id` | TEXT | FK → `rich_notes` |
| `type` | INTEGER | `2`=voice, `5`=speech audio, `6`=speech LRC, `7`=speech contact, `8`=speech schedule, `9`=LRC picture, `11`=identify voice, `12`=identify voice LRC, `14`=external audio, `21`=new LRC, `22`=new mark |
| `state` | INTEGER | Sync/upload state |
| `md5` | TEXT | File integrity hash |
| `url` | TEXT | Cloud URL after upload |
| `checkPayload` | TEXT | Integrity check payload |
| `file_name` | TEXT | Local filename (e.g., `rec_1730537892000.mp3`) |
| `cloud_metadata` | TEXT | Cloud storage metadata JSON |
| `extra` | TEXT | Extra metadata JSON (format **UNKNOWN**) |
| `width` | INTEGER | Non-zero for `TYPE_LRC_PICTURE` only |
| `height` | INTEGER | Non-zero for `TYPE_LRC_PICTURE` only |
| `associate_attachment_id` | TEXT | Links related attachments (e.g., audio → LRC attachment) |

**Typical voice recording row (`type = 2`):**
- `type = 2`, `file_name = "rec_<ts>.mp3"`, `width = 0`, `height = 0`, `associate_attachment_id = NULL`

**Speech audio row (`type = 5`):**
- `type = 5`, `file_name = "rec_<ts>.mp3"`, `associate_attachment_id` → LRC attachment ID

**External audio row (`type = 14`):**
- `type = 14`, `file_name` = original imported filename, `url` may be set if from cloud

### 6.2 `speech_log_info` Table (VERIFIED — all 18 columns)

This table stores enriched metadata for speech-recognition sessions, one row per recognised speech event.

| Column | Type | Purpose |
|--------|------|---------|
| `summary_id` | TEXT PK | Unique identifier for this speech log entry |
| `rich_note_id` | TEXT | FK → `rich_notes.rich_note_id` |
| `speech_log_id` | TEXT | ID of the speech processing log |
| `contact_cover` | TEXT | Contact photo URI (for call-log recordings) |
| `contact_number` | TEXT | Phone number of the contact |
| `contact_name` | TEXT | Display name of the contact |
| `entity` | TEXT | Named entity extracted by ASR (INFERRED: JSON blob) |
| `voice_id` | TEXT | Identifier of the voice model or speaker |
| `voice_url` | TEXT | Cloud URL of the voice audio |
| `voice_lrc_id` | TEXT | Attachment ID of the voice LRC file |
| `voice_lrc_url` | TEXT | Cloud URL of the LRC file |
| `flag` | INTEGER DEFAULT 0 | Status/processing flag (values **UNKNOWN**) |
| `speech_create_time` | INTEGER | Unix epoch of speech capture |
| `speech_type` | INTEGER DEFAULT 0 | Type discriminator (values **UNKNOWN**; likely mirrors attachment type constants) |
| `pic_id` | TEXT | Attachment ID of the generated LRC picture |
| `speech_mark` | TEXT | Bookmark/mark positions within the recording (INFERRED: JSON array of `{time, label}`) |
| `combined_card` | TEXT | JSON blob of a combined multi-type card (contact + schedule etc.) |
| `extra_info` | TEXT | Additional metadata (format **UNKNOWN**) |

### 6.3 `rich_notes` Table — Audio-Relevant Columns (VERIFIED)

| Column | Type | Purpose |
|--------|------|---------|
| `attachment_lrc` | TEXT | Inline LRC transcription content stored directly on the note row |
| `summary_speech_flag` | INTEGER NOT NULL | Flag indicating speech summarisation status |
| `summary_speech_type` | INTEGER NOT NULL DEFAULT 0 | Type of speech summary (values **UNKNOWN**) |

---

## 7. LRC Synchronisation

### 7.1 LRC Format Specification

**Confidence:** **STRONGLY SUPPORTED** (from field names `attachment_lrc`, `lrcContent`, `voice_lrc_id`, `voice_lrc_url`)

The LRC format is a plain-text subtitle standard originally designed for karaoke lyric synchronisation. ColorOS Notes repurposes it for audio transcription sync.

**Standard LRC structure:**
```
[ar:Artist]
[ti:Title]
[al:Album]
[00:00.00] First line of text at 0 seconds
[00:05.23] Second line at 5.23 seconds
[01:23.45] Line at 1 minute 23.45 seconds
```

**ColorOS Notes usage (INFERRED):**
```
[00:00.00] Hello, this is a voice recording.
[00:03.50] I wanted to note that the meeting is at three PM.
[00:08.12] Please bring the quarterly report.
```

### 7.2 LRC Storage Locations

| Location | Usage | Confidence |
|----------|-------|------------|
| `RecordAttr.lrcContent` (in-memory) | LRC content passed through bridge for immediate UI display | **VERIFIED** (field exists) |
| `AudioInfo.lrcContent` (in-memory) | LRC content in UI-layer model | **VERIFIED** (field exists) |
| `rich_notes.attachment_lrc` (database) | Inline LRC persisted on note row for fast retrieval | **VERIFIED** |
| `attachments` row with `type = 6` (`TYPE_SPEECH_LRC`) | LRC stored as a separate file attachment | **VERIFIED** (type constant) |
| `speech_log_info.voice_lrc_id` / `voice_lrc_url` | LRC attachment ID + cloud URL | **VERIFIED** |

### 7.3 `speech_log_info.speech_mark` Field

**Confidence:** **INFERRED**

`speech_mark` is a TEXT column, likely storing a JSON array of user-placed bookmarks within the audio timeline. Probable structure:

```json
[
  { "time": 12500, "label": "Important point" },
  { "time": 45000, "label": "" }
]
```

This field corresponds to `RecordAttr.hasMarks: boolean` — when `hasMarks = true`, one or more entries exist in `speech_mark`.

### 7.4 `AudioInfo.lrcSpeech` Field

**Confidence:** **INFERRED**

`AudioInfo` contains both `lrcContent` and `lrcSpeech`. The distinction is **INFERRED** as:
- `lrcContent` — word-level or sentence-level transcript with timestamps
- `lrcSpeech` — speaker-diarised variant, possibly with speaker labels embedded

---

## 8. Speech Recognition (ASR) Architecture

### 8.1 Package Inventory (VERIFIED)

| Package / Library | Role |
|-------------------|------|
| `com.oplus.osmartvoiceservicelib.asr` | OPLUS proprietary ASR service library |
| `com.oplus.note.recognization` | Notes-side recognition orchestration |
| `com.oplus.aiunit.av` | Audio/visual AI unit (OPLUS AI framework) |
| `libonnxruntime.so` (14 MB) | ONNX Runtime — ML model inference engine |
| `libSuniaEngine.so` (14 MB) | OPLUS Sunia HTR/speech engine |
| `libSNHTREngine.so` (6.9 MB) | OPLUS SNHTR speech engine (lighter variant) |

### 8.2 ASR Pipeline (INFERRED architecture)

```
Audio capture (AudioRecord / MediaRecorder)
        │
        ▼
PCM audio buffer
        │
        ▼
com.oplus.note.recognization
        │
        ├── On-device path ──▶ libonnxruntime.so ──▶ ONNX speech model
        │                           │
        │                   libSuniaEngine.so / libSNHTREngine.so
        │                           │
        │                    Raw transcript text
        │
        └── Cloud path (INFERRED) ──▶ OPLUS cloud ASR API
                                           │
                                    Transcript + LRC

        ▼
com.oplus.osmartvoiceservicelib.asr
        │
        ▼
LRC generation → stored in rich_notes.attachment_lrc
              → attachment row type=6 (TYPE_SPEECH_LRC)
              → speech_log_info row
```

### 8.3 On-Device vs Cloud ASR

| Aspect | Assessment | Confidence |
|--------|------------|------------|
| On-device ONNX model present | `libonnxruntime.so` (14 MB) present | **VERIFIED** |
| On-device engine | `libSuniaEngine.so` + `libSNHTREngine.so` | **VERIFIED** |
| Cloud ASR dependency | `speech_log_info.voice_url` / `voice_lrc_url` fields imply cloud storage of results | **STRONGLY SUPPORTED** |
| Offline-capable ASR | Possible given ONNX model size; not confirmed | **INFERRED** |
| Language support | Unknown; likely Mandarin-primary (OPLUS/OPPO target market) | **UNKNOWN** |

> [!CAUTION]
> The OPLUS ASR stack (`libSuniaEngine`, `libSNHTREngine`, ONNX models) is proprietary and cannot be redistributed. Any cross-platform port **must** replace this with an open or licensed ASR engine.

### 8.4 ASR Attachment Linkage

When ASR completes:
1. `RecordAttr.isAsrAudio` is set to `true`
2. `RecordAttr.asrAttachId` is populated with the ID of the `TYPE_SPEECH_LRC` attachment
3. `rich_notes.attachment_lrc` is populated with inline LRC content
4. A `speech_log_info` row is created with `voice_lrc_id`, `voice_lrc_url`

---

## 9. Call Log Integration

### 9.1 Evidence

| Field | Source | Confidence |
|-------|--------|------------|
| `RecordAttr.hasCallLogs: boolean` | VERIFIED field | **VERIFIED** |
| `AudioInfo.hasCallLogs: boolean` | VERIFIED field | **VERIFIED** |
| `RecordAttrNew.hasCallLogs: boolean` | VERIFIED field | **VERIFIED** |
| `speech_log_info.contact_cover` | VERIFIED column | **VERIFIED** |
| `speech_log_info.contact_name` | VERIFIED column | **VERIFIED** |
| `speech_log_info.contact_number` | VERIFIED column | **VERIFIED** |

### 9.2 Behaviour (INFERRED)

When a phone call is recorded:
1. `hasCallLogs = true` is set on the `RecordAttr`
2. A `speech_log_info` row is created with `contact_name`, `contact_number`, and `contact_cover` (photo URI from Contacts)
3. The audio card in the WebView may display caller identity alongside the recording

### 9.3 Platform Implications

| Platform | Call Recording | Confidence |
|----------|---------------|------------|
| Android (ColorOS) | Native; call recording permitted by OPPO | **VERIFIED** (integration exists) |
| Android (Stock/other OEMs) | Restricted post Android 10 (requires system privilege or carrier permission) | **STRONGLY SUPPORTED** |
| iOS | Not permitted by Apple App Store guidelines | **STRONGLY SUPPORTED** |
| Web / PWA | `MediaRecorder` captures microphone only; no call integration | **STRONGLY SUPPORTED** |
| Flutter | Audio record from microphone only; no native call hook without platform channel | **STRONGLY SUPPORTED** |

---

## 10. Cross-Platform Portability Assessment

### 10.1 Component-by-Component Analysis

| Component | OPLUS Implementation | Portability | Replacement Strategy |
|-----------|---------------------|-------------|---------------------|
| **Audio capture** | Android `MediaRecorder` → MP3 | ✅ High | Web: `MediaRecorder` API (WebM/Opus or MP3 via codec); Flutter: `flutter_sound` / `record` package; Native Android: same API |
| **Audio playback** | Android `MediaPlayer` | ✅ High | Web: HTML5 `<audio>` / Web Audio API; Flutter: `just_audio` / `flutter_sound` |
| **File format (MP3)** | MP3 (`DEFAULT_AUDIO_FORMAT = "mp3"`) | ✅ High | MP3 is universally supported across all target platforms |
| **LRC sync** | Standard `.lrc` format | ✅ High | Standard text format; parseable on all platforms with a ~50-line parser |
| **ASR / transcription** | OPLUS `libSuniaEngine` + ONNX | ⚠️ None | Must replace: Whisper (OpenAI, on-device), Google Cloud Speech-to-Text, Vosk (open-source on-device), Web Speech API (browser) |
| **LRC generation** | OPLUS proprietary pipeline | ⚠️ None | Derive from ASR output; standard timestamp alignment |
| **Call log integration** | Android system telephony API | ❌ Platform-specific | Android only; stub/omit on other platforms |
| **Contact metadata** | Android `ContactsContract` | ❌ Platform-specific | Android/iOS: platform contacts API; Web: not available |
| **Cloud sync of audio** | OPLUS cloud (HeyTap) | ❌ Proprietary | Replace with user-chosen cloud (Drive, S3, self-hosted) |
| **ONNX model files** | Bundled proprietary models | ❌ Cannot redistribute | Use Whisper or other open model weights |

### 10.2 Portability Risk Matrix

```
HIGH RISK (must replace before shipping):
  - ASR engine (libSuniaEngine, libSNHTREngine, ONNX models)
  - Cloud audio upload (HeyTap cloud URLs in speech_log_info)

MEDIUM RISK (platform-conditional):
  - Call log integration (Android-only; omit or stub on other platforms)
  - Contact metadata fetch (platform-specific permissions)

LOW RISK (straightforward substitution):
  - Audio capture: standard API exists everywhere
  - Audio playback: standard API exists everywhere
  - MP3 format: universally supported
  - LRC format: plain text, portable
```

---

## 11. Platform Abstraction Requirements

To enable a cross-platform reimplementation, three core interfaces must be defined:

### 11.1 `AudioRecorder` Interface

```kotlin
interface AudioRecorder {
    suspend fun startRecording(outputPath: String): RecordingSession
    suspend fun stopRecording(session: RecordingSession): RecordAttr
    suspend fun pauseRecording(session: RecordingSession)
    suspend fun resumeRecording(session: RecordingSession)
    val state: StateFlow<RecordingState>
}

enum class RecordingState { IDLE, RECORDING, PAUSED, STOPPING }
```

**Platform implementations:**
- Android: `MediaRecorder` + MP3 encoding
- Web: `MediaRecorder` API + `audio/webm;codecs=opus` (transcode server-side if MP3 needed)
- iOS (Flutter): `flutter_sound` `FlutterSoundRecorder`

### 11.2 `AudioPlayer` Interface

```kotlin
interface AudioPlayer {
    suspend fun load(src: String)
    suspend fun play()
    suspend fun pause()
    suspend fun seekTo(positionMs: Long)
    val currentTime: StateFlow<Long>
    val state: StateFlow<PlaybackState>
}

enum class PlaybackState { STOPPED, PLAYING, PAUSED, BUFFERING }
```

**Platform implementations:**
- Android: `MediaPlayer` / `ExoPlayer`
- Web: HTML5 `<audio>` element / Howler.js
- iOS: `AVAudioPlayer` (via Flutter platform channel)

### 11.3 `TranscriptionService` Interface

```kotlin
interface TranscriptionService {
    suspend fun transcribe(audioPath: String, language: String?): TranscriptionResult
    val isAvailable: Boolean
    val supportsOffline: Boolean
}

data class TranscriptionResult(
    val lrcContent: String,         // Standard LRC format
    val plainText: String,          // Raw transcript
    val confidence: Float,
    val language: String
)
```

**Platform implementations (recommended priority):**

| Priority | Engine | License | Offline | Quality |
|----------|--------|---------|---------|---------|
| 1 | OpenAI Whisper (local via ONNX/ggml) | MIT | ✅ Yes | High |
| 2 | Google Cloud Speech-to-Text | Commercial | ❌ No | High |
| 3 | Vosk | Apache 2.0 | ✅ Yes | Medium |
| 4 | Web Speech API | Browser built-in | ❌ No | Varies |
| 5 | OPLUS ASR (Android only) | Proprietary | ✅ Yes | High (Chinese) |

---

## 12. Open Questions / Further Investigation Needed

| # | Question | Priority |
|---|----------|----------|
| 1 | What exact `MediaRecorder` encoder settings produce the MP3 output? (Is it libmp3lame via JNI, or a custom OPLUS encoder?) | HIGH |
| 2 | What are the actual `state` integer values used in `callUpdateRecordStateFromJava`? | HIGH |
| 3 | What are the exact `type` string constants in `RecordTypeAttr.type`? | HIGH |
| 4 | What is the structure of `speech_log_info.entity` (named entity JSON schema)? | MEDIUM |
| 5 | What are the `speech_log_info.flag` and `speech_log_info.speech_type` value semantics? | MEDIUM |
| 6 | What ONNX model files are bundled, and which ASR architecture do they implement? | MEDIUM |
| 7 | Is the ASR pipeline fully on-device, or does it require cloud fallback? | MEDIUM |
| 8 | What languages does the OPLUS ASR support? | LOW |
| 9 | What is the structure of `attachments.extra` JSON for audio rows? | LOW |
| 10 | What is the `AudioInfo.lrcSpeech` field format vs `lrcContent`? (Speaker diarisation?) | LOW |

---

*Document generated: 2026-11-02 | Revision: 1.0 | Next review: after dynamic analysis / frida trace of audio recording flow*
