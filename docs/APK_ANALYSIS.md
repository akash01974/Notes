# APK Analysis — ColorOS Notes (`com.coloros.note`)

Static reverse engineering via **jadx 1.5.1** (code) + **apktool 2.11.1** (resources, manifest) + **apkanalyzer/aapt2** (metadata).
Source artifact: `ColorOSNotes.apk` (257,665,765 bytes, arm64-v8a, 28 native `.so` libs).
All findings below are **statically verified** unless explicitly marked `[SPECULATIVE]`.

## 1. Identity

| Field | Value |
|---|---|
| Package | `com.coloros.note` |
| Version name | 16.7.5 |
| Version code | 164070005 |
| compileSdk | 35 (Android 15) |
| minSdk | 31 (Android 12) |
| targetSdk | 35 |
| Primary ABI | arm64-v8a (28 native libs) |
| Internal code namespace | `com.nearme.note.*` + `com.oplus.note.*` |

The app targets OPPO/OnePlus/Realme (ColorOS/OxygenOS). It ships under two internal package roots (`com.nearme.note` legacy, `com.oplus.note` modern) reflecting the historical OPPO→OPLUS rebrand.

## 2. Component inventory (from decoded `AndroidManifest.xml`)

- **53 activities**
- **28 services**
- **29 content providers**
- **20 broadcast receivers**

### 2.1 Main entry points
- `com.nearme.note.main.MainActivity` — launcher entry, hosts the note list / todo tabs.
- `com.nearme.note.activity.richedit.NoteViewRichEditActivity` — the rich-text note editor (WebView/tiptap host).
- `com.nearme.note.activity.edit.NoteViewEditActivity` — legacy/plain note editor.
- `com.nearme.note.activity.richedit.QuickNoteViewRichEditActivity` — quick-note entry (widget / quick capture).
- `com.nearme.note.paint.*` — handwriting / drawing (`PaintActivity`, `HandPaintNoteActivity`, `NewPaintActivity`, `QuickPaintActivity`, `CropActivity`).

### 2.2 Organization & data
- `com.nearme.note.db.NotesProvider` — primary `ContentProvider` exposing notes/folders to other apps & system search.
- `com.oplus.note.search.NotesSearchProvider` — system-wide search integration.
- Card-widget providers (`NoteCardWidgetProvider`, seedling/lock-screen card providers) — home-screen card rendering.

### 2.3 AI & cloud services
- `com.oplus.aiwriter.sdk.KitSdkProvider` — AI Writer SDK.
- `com.oplus.note.aigraffiti.*` — AI graffiti / sketch-to-image.
- `com.oplus.note.ai_extract.*` — smart cutout (`CutoutActivity`), picture enhance (`EnhancePicActivity`), SuperText (`SuperTextActivity`).
- `com.oplus.cloud.sync.note.SyncNoteServive` + `com.heytap.cloud.sync.note.SyncNoteServive` — dual cloud-sync implementations (legacy HeyTap + new OPLUS Cloud).
- `com.heytap.cloudkit.libsync.service.CloudSyncService` — generic cloudkit sync bridge.

### 2.4 Widgets
- `NoteWidgetProvider` / `NoteWidgetRemoteViewService` — note list widget.
- `ToDoWidgetProvider` / `TodoWidgetRemoteViewService` — todo widget.
- `lock_card.rpk`, `note_2x2.upk`, `notebook_2x4.upk`, `notebook_4x4.upk` — RPK/UPK card-widget packages (OPLUS card framework).

## 3. Permissions

### 3.1 Standard Android (portable)
`INTERNET`, `ACCESS_NETWORK_STATE`, `ACCESS_WIFI_STATE`, `POST_NOTIFICATIONS`, `RECEIVE_BOOT_COMPLETED`, `RECORD_AUDIO`, `VIBRATE`, `WAKE_LOCK`, `SCHEDULE_EXACT_ALARM`, `TURN_SCREEN_ON`, `SYSTEM_ALERT_WINDOW`, `FOREGROUND_SERVICE(_DATA_SYNC)`, `QUERY_ALL_PACKAGES`, `READ_FRAME_BUFFER`.

### 3.2 Manufacturer-specific (ColorOS/OPLUS/HeyTap — NOT portable)
- `com.oplus.permission.safe.*` (AI_APP, APP_MANAGER, AUTHENTICATE, BACKUP, IOT, PRIVATE, PROTECT, SAU, SECURITY, SETTINGS, WINDOW)
- `com.oppo.permission.safe.PRIVATE`, `oppo.permission.OPPO_COMPONENT_SAFE`, `oplus.permission.OPLUS_COMPONENT_SAFE`
- `com.oplus.interconnect.permission.SERVICE`, `com.oplus.metis.factdata.permission.DATABASE`, `com.oplus.oshare.permission.READ_OSHARE_PROVIDER`, `com.oplus.ipemanager.permission.receiver.DOUBLE_CLICK`
- `com.coloros.speechassist.permission.SPEECH_SERVICE`
- `com.coloros.cloud.ACCESS_SYNC_SERVICE`, `heytap.permission.cloud.*`, `oppo.permission.cloud.*`
- Launcher backup: `com.android.launcher.permission.*`, `com.oppo.launcher.permission.*`, `net.oneplus.launcher.permission.*`

### 3.3 Queried packages (implicit manufacturer dependencies)
`com.coloros.cloud`, `com.nearme.sync`, `com.heytap.cloud`, `com.coloros.ocrscanner`, `com.coloros.ocrservice`, `com.coloros.speechassist`, `com.heytap.speechassist`, `com.oplus.ai.assistant`, `com.coloros.accessibilityassistant`, `com.oplus.themestore`/`com.heytap.themestore`/`com.nearme.themespace` (fonts), `com.coloros.filemanager`, `com.oplus.screenshot`, `com.oplus.aipaint`, `com.oplus.paintplugin`, `cn.wps.moffice.lite`, `com.coloros.translate.engine`, `com.oplus.supertextinput`, `com.coloros.soundrecorder`.

The app queries these at runtime and gracefully degrades when absent — a key signal that core note editing is self-contained while AI/cloud/font/OCR features are optional add-ons.

## 4. Bundled assets — feature surface

| Asset / dir | Evidence of feature |
|---|---|
| `assets/tiptap/` (Vue + ProseMirror + tiptap web bundle) | Rich-text editor is **web-based**, full formatting set |
| `assets/audio/{high,low}.ogg` | Voice recording feedback sounds |
| `assets/math/`, `assets/hwr/`, `assets/recognize/` | Handwriting + math recognition engines |
| `assets/nai/`, native `libnaiengine.so`/`libnbiengine.so`/`libonnxruntime.so` | On-device AI/ONNX inference |
| `libinkEngineNative.so`, `libpaint.so`, `libshapereco.so`, `libgraphicreco.so` | Ink/shape/graphic recognition for handwriting |
| `assets/preset_note_images/` (AI paint/summary guides) | AI Painter + AI Summary UX |
| Lottie JSONs (`cloudkit_*`, `aigc_*`, `cloud_sync_*`, `coui_*`) | Cloud sync status + AI animations, COUI design system |
| `assets/preset_note_images/ai_summary_*` | AI Summary feature |

### 4.1 Rich-text formatting (tiptap extension scan, verified by token frequency)
`table`, `image`, `color`, `link`, `fontSize`, `placeholder`, `underline`, `bold`, `heading`, `bulletList`, `blockquote`, `textAlign`, `taskList` (checklists), `orderedList`, `highlight`, `italic`, `strike`, `codeBlock`.
→ Full rich-text editor: headings, bold/italic/strike/underline, lists (bullet/ordered/task), blockquote, code block, text/background color, font size, alignment, links, images, tables, highlight.

## 5. Storage — see `DATABASE_ANALYSIS.md`
Room database **v47**, 14 tables. Note content stored as HTML (`text` / `raw_text` / `html_text`). Checklists serialize to `<li class="checked|unchecked">` (tiptap `data-type="taskItem"`). Handwriting stored as paint notes with ink strokes + `first_img` thumbnail.

## 6. Key architecture finding — the editor is a WebView
The note editor is **not** a native Android editor. It is a **Vue + tiptap/ProseMirror** single-page app bundled in `assets/tiptap/`, hosted by `com.oplus.notes.webview.*` (`WVJBWebView`, a WebView-JavaScript bridge). Java exposes editor actions via `@JavascriptInterface`; the JS returns HTML (`getAIGCHtmlContent`, `getAttachData`, etc.).

**Implication for the rebuild:** the single most valuable reusable artifact is `assets/tiptap/`. Its formatting set + HTML serialization defines the note content format and can be reused nearly verbatim on desktop (Linux/Windows/macOS) and web, giving a genuine 1:1 editing experience rather than a reimplementation.

## 7. Version / SDK facts (metadata)
- compileSdkVersion 35, targetSdk 35, minSdk 31.
- `versionName=16.7.5`, `versionCode=164070005`, APK size 257.7 MB (dominated by on-device AI models + native libs + tiptap bundle).
