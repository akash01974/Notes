# Platform Dependency Inventory

| Field | Value |
|---|---|
| **Status** | RESEARCH AUDIT — Evidence-based, no implementation |
| **Date** | 2026-11-02 |
| **Scope** | ColorOS Notes APK v16.7.5 (versionCode 164070005), package `com.coloros.note` |
| **compileSdkVersion** | 35 (Android 15) |
| **minSdkVersion** | 31 (Android 12) |
| **Sources** | APK lib inventory, decompiled package listing, `AppDatabase_Impl.java`, `manifest.xml`, smoke-test logs |

> [!IMPORTANT]
> Every claim is tagged with one of four confidence levels:
> - **VERIFIED** — directly observed in source files / binary inventory / test run
> - **STRONGLY SUPPORTED** — inferred from package names + manifest entries with high confidence
> - **INFERRED** — reasonable inference from context; not directly verified
> - **UNKNOWN** — insufficient evidence; left for future research

---

## Executive Summary

| Category | Count | Overall Portability |
|---|---|---|
| A. Standard Android / Portable | 12 subsystems | ✅ Drop-in or trivially replaceable |
| B. ColorOS / OPLUS System-Specific | 10 subsystems | ❌ Must be reimplemented or removed |
| C. HeyTap / OPLUS Cloud & Account Services | 8 subsystems | ❌ Must be replaced entirely |
| D. AI / ML SDKs (Proprietary OPLUS) | 7 subsystems | ⚠️ ONNX Runtime portable; others must be replaced |
| E. Native C/C++ Libraries | 27 distinct `.so` files | ⚠️ Mixed — several are open-source or ONNX-hosted |
| F. External App Integrations | 9 integration points | ⚠️ Standard intents portable; OPLUS-specific removable |
| G. Hardware-Dependent Features | 5 hardware APIs | ✅ Accessible via standard Android or OS APIs |

**Key Finding (VERIFIED):** The TipTap/ProseMirror + Vue 3 editor bundle runs 15/15 smoke tests in headless Chromium 156 without any Android or OPLUS infrastructure. The editor itself is fully portable. The bridge layer (188 handlers / 107 `@JavascriptInterface` methods) and native AI/drawing libraries are the primary portability blockers.

---

## A. Standard Android / Portable Dependencies

These dependencies use standard, publicly documented Android APIs available on all Android 12+ devices and, where noted, on other platforms.

### A1. Database — Room (SQLite)
- **Evidence quality:** VERIFIED
- **Source:** `AppDatabase_Impl.java` decompiled; `androidx.room.MultiInstanceInvalidationService` in manifest
- **Details:** Room v47, 14 tables (`notes`, `folders`, `notes_attributes`, `words`, `alarm_note`, `todo`, `note_skin`, `note_paragraph_style`, `rich_notes`, `attachments`, `speech_log_info`, `collect_privacy`, `paint_notes`, `paint_attachments`)
- **Portability:** ✅ Room is standard AndroidX; schema is fully reproducible. SQLite engine is universal.

### A2. Networking — OkHttp / Retrofit
- **Evidence quality:** VERIFIED (package listing: `okhttp3.*`, `retrofit2.*`)
- **Details:** Standard HTTP client stack used for cloud sync, analytics, and API calls
- **Portability:** ✅ Pure JVM; fully portable across Android and JVM-based desktop

### A3. Image Loading — Glide
- **Evidence quality:** VERIFIED (package listing: `com.bumptech.glide`)
- **Details:** Image loading, caching, transformation library
- **Portability:** ✅ Standard Android library; replaceable with Coil, Picasso, or platform-native equivalents

### A4. Animations — Lottie
- **Evidence quality:** VERIFIED (package listing: `com.airbnb.lottie`)
- **Details:** JSON-driven vector animations for UI chrome
- **Portability:** ✅ Portable; Lottie has cross-platform (Web, iOS, Desktop) variants

### A5. Audio Recording — MediaRecorder
- **Evidence quality:** STRONGLY SUPPORTED
- **Source:** `Attachment.DEFAULT_AUDIO_FORMAT = "mp3"` (VERIFIED); `android.permission.RECORD_AUDIO` in manifest (VERIFIED); `SpeechTransparentActivity`, `NotificationForegroundService` in manifest (VERIFIED)
- **Details:** Android `MediaRecorder` API producing MP3 output; `MediaPlayer` for playback with LRC timestamp sync
- **Portability:** ✅ Standard Android API; abstraction required for other platforms

### A6. Camera — CameraX / Camera2
- **Evidence quality:** STRONGLY SUPPORTED
- **Source:** `ACTION_IMAGE_CAPTURE`, `ACTION_PICK` intents queried; `com.nearme.note.paint.CropActivity` in manifest
- **Details:** Photo capture, gallery pick, and crop workflows
- **Portability:** ✅ Standard Android APIs; `ACTION_IMAGE_CAPTURE` intent is universal on Android

### A7. Background Tasks — WorkManager / AlarmManager
- **Evidence quality:** VERIFIED
- **Source:** `androidx.work.*` entries in `manifest_names.txt` (SystemAlarmService, SystemJobService, SystemForegroundService, ConstraintProxy); `android.permission.SCHEDULE_EXACT_ALARM`, `android.permission.FOREGROUND_SERVICE`, `RECEIVE_BOOT_COMPLETED` (VERIFIED)
- **Details:** WorkManager for deferred background sync and AI tasks; AlarmManager for note reminders; `AlarmUtils$AlarmReceiver` for alarm delivery
- **Portability:** ✅ Standard AndroidX; abstraction required for non-Android targets

### A8. File Sharing — FileProvider
- **Evidence quality:** VERIFIED
- **Source:** `com.oplus.note.NoteFileProvider` in manifest; `android.support.FILE_PROVIDER_PATHS` meta-data (VERIFIED)
- **Details:** Secure URI-based file sharing via `FileProvider`; used for sharing note images and exports
- **Portability:** ✅ Standard AndroidX `FileProvider`

### A9. Serialization — Google Protobuf
- **Evidence quality:** STRONGLY SUPPORTED (package: `com.google.*` includes Protobuf)
- **Details:** Used for data serialization in cloud sync payloads and potentially inter-process communication
- **Portability:** ✅ Protobuf is fully cross-platform (has JS, Python, C++, Kotlin targets)

### A10. Crash Reporting — Firebase Crashlytics
- **Evidence quality:** STRONGLY SUPPORTED (package: `com.google.*` Firebase)
- **Details:** Standard crash and ANR reporting
- **Portability:** ✅ Replaceable; Firebase SDK is cross-platform or can be dropped

### A11. Runtime — Kotlin / AndroidX
- **Evidence quality:** VERIFIED (packages: `kotlin.*`, `kotlinx.*`, `androidx.*`)
- **Details:** Kotlin Coroutines, Flow, Lifecycle, Navigation, ViewModel, EmojiCompat, ProfileInstaller
- **Portability:** ✅ Kotlin Multiplatform targets Android, JVM, JS, iOS; AndroidX patterns are portable in spirit

### A12. Standard Intents
- **Evidence quality:** VERIFIED (manifest_names.txt)
- **Details:** `ACTION_SEND`, `ACTION_SEND_MULTIPLE`, `ACTION_VIEW`, `ACTION_PROCESS_TEXT`, `ACTION_DIAL`, `ACTION_INSERT_OR_EDIT`, `LOCALE_CHANGED`, `TIME_SET`, `TIMEZONE_CHANGED`, `BOOT_COMPLETED`
- **Portability:** ✅ All standard Android intents; non-Android platforms use platform-native equivalents

---

## B. ColorOS / OPLUS System-Specific Dependencies

These are OPLUS-proprietary platform extensions unavailable on stock Android or other platforms.

### B1. TBL WebView (Turbo Browser Layer)
- **Evidence quality:** VERIFIED
- **Source:** `org.chromium.content.app.TBLPrivilegedProcessService0–4` in manifest (VERIFIED); `tbl.webkit.APPLICATION_TYPE = NOTEAPP` meta-data (VERIFIED); `libtbljniutils.so` in lib directory (VERIFIED); `com.oplus.tbl.webview.*` packages (VERIFIED); smoke test exception `Gc(...).showHandles is not a function` (VERIFIED)
- **Details:** OPLUS-proprietary Chromium fork providing TBL (Turbo Browser Layer) with additional JNI extensions including `showHandles` (text selection handles API not in standard WebView). Five privileged process services (`TBLPrivilegedProcessService0-4`). The editor bundle loads inside TBL WebView.
- **Portability:** ❌ **BLOCKER.** TBL-specific APIs (`showHandles`, JNI bridge via `libtbljniutils.so`) must be stubbed or replaced with standard WebView / Chromium equivalents on non-OPLUS devices

### B2. OPLUS Physics Engine
- **Evidence quality:** STRONGLY SUPPORTED
- **Source:** `com.oplus.physicsengine.*` package; `com.oplus.physicsengine` library reference
- **Details:** Custom physics simulation for UI animations (spring, friction, inertia effects in note cards and transitions)
- **Portability:** ❌ Must be replaced with standard `DynamicAnimation`, Compose physics, or Web Animation API equivalents

### B3. OPLUS VFX SDK
- **Evidence quality:** STRONGLY SUPPORTED
- **Source:** `com.oplus.vfxsdk.*` package; `libvfxmagicediteffect.so` (451 KB) in lib directory (VERIFIED)
- **Details:** Visual effects SDK for magic eraser, magic edit, and AI-enhanced image effects within paint notes
- **Portability:** ❌ Proprietary; must be replaced or effects feature disabled

### B4. OPLUS Compatibility Shims
- **Evidence quality:** VERIFIED
- **Source:** `com.oplus.compat.*` package; `OplusAppCompatibilityToken = 22,22` meta-data (VERIFIED)
- **Details:** Adapter layer for OPLUS system APIs, providing compatibility between OPPO/OnePlus/ColorOS versions
- **Portability:** ❌ OPLUS-internal; not needed outside ColorOS ecosystem

### B5. COUI Design System / Skin System
- **Evidence quality:** VERIFIED
- **Source:** `coui.support.appcompat.version` meta-data (VERIFIED); `color_material_enable = true` meta-data (VERIFIED); `color.support.options` meta-data (VERIFIED); `com.oplus.note.skin.SkinUrlInitializer` (VERIFIED); `note_skin` database table (VERIFIED)
- **Details:** ColorOS UI (COUI) design token system providing OPLUS-specific themes, color schemes, and skin system. The `note_skin` DB table stores per-note skin selections. Font system references `com.heytap.themestore.action.FONT_FOR_NOTE`.
- **Portability:** ❌ COUI tokens must be replaced with standard Material Design or custom design system; skin system can be re-implemented generically

### B6. ColorOS Font System
- **Evidence quality:** STRONGLY SUPPORTED
- **Source:** `com.heytap.themestore.action.FONT_FOR_NOTE` queried intent (VERIFIED); `com.heytap.themestore` / `com.nearme.themestore` / `com.oplus.themestore` queried packages
- **Details:** Dynamic font loading from HeyTap Theme Store; notes-specific font picker
- **Portability:** ❌ HeyTap Theme Store not available outside OPLUS ecosystem; must use system fonts or bundled fonts

### B7. SuperText / SuperTextInput
- **Evidence quality:** STRONGLY SUPPORTED
- **Source:** `com.oplus.supertextinput` queried package; `com.oplus.note.ai_extract.ui.SuperTextPaint.SuperTextActivity` (VERIFIED)
- **Details:** OPLUS proprietary rich text input/rendering engine providing advanced text selection, stylus-aware input, and AI text extraction features
- **Portability:** ❌ OPLUS-proprietary; must replace with standard `TextInputEditText` or custom text rendering

### B8. OShare Integration
- **Evidence quality:** VERIFIED
- **Source:** `com.oplus.oshare.permission.READ_OSHARE_PROVIDER` permission (VERIFIED); `com.nearme.note.touchshare.share.TouchShareService` + `TouchShareReceiveActivity` (VERIFIED)
- **Details:** OPLUS-proprietary peer-to-peer sharing (equivalent of AirDrop). Notes can be shared directly between OPLUS devices via "Touch Share"
- **Portability:** ❌ OPLUS-specific; replace with standard Android Beam / Nearby Share API or remove

### B9. Pantanal / CardWidget (Lockscreen & Desktop Widget)
- **Evidence quality:** VERIFIED
- **Source:** `com.oplus.pantanal.*` packages (VERIFIED); `com.nearme.note.cardwidget.provider.NoteCardWidgetProvider` (VERIFIED); `android.card.provider`, `android.card.todo.*` meta-data (VERIFIED); `pantanal.card.action.RPKCARD_UPDATE` in manifest_names (VERIFIED); `NoteLockScreenCardProvider`, `NoteSeedingCardProvider`, `NoteSmartSummaryCardProvider` (VERIFIED)
- **Details:** Pantanal is the OPLUS lockscreen/desktop widget system. Notes provides card widgets for lockscreen (showing note content), desktop note widget, and todo widget. Uses Pantanal's RPK card format.
- **Portability:** ❌ Pantanal is OPLUS-specific; standard Android App Widgets (`AppWidgetProvider`) are partially used but the Pantanal card system is separate

### B10. Epona Routing Framework
- **Evidence quality:** VERIFIED
- **Source:** `com.oplus.epona.*` packages; `com.oplus.epona:epona` process; `com.oplus.epona.internal.EponaProvider` ContentProvider (VERIFIED)
- **Details:** OPLUS internal service routing/IPC framework used for inter-component communication within the OPLUS platform
- **Portability:** ❌ OPLUS-internal; replace with standard Android IPC (Binder, ContentProvider, Broadcasts)

---

## C. HeyTap / OPLUS Cloud & Account Services

All components in this category are OPLUS-proprietary cloud infrastructure with no open-source equivalents.

### C1. HeyTap Account SDK
- **Evidence quality:** VERIFIED
- **Source:** `com.heytap.usercenter.accountsdk.utils.UCAccountSDKInitProvider`, `UserCenterOperateReceiver` (VERIFIED); `com.heytap.usercenter`, `com.heytap.openid`, `com.oneplus.account`, `com.oplus.account`, `com.oppo.usercenter` queried (VERIFIED); `com.platform.usercenter.account.ams.provider.AcAccountBaseSdkInitProvider`, `AcAccountSdkInitProvider` (VERIFIED); `com.accountbase.*`, `com.accountservice.*` packages
- **Details:** HeyTap/OPLUS proprietary user identity and authentication system. Provides OAuth tokens for cloud sync. Multiple package variants (OPPO/OnePlus/ColorOS) indicate legacy version handling. `libauthlib.so` (7.7 MB) is the native component.
- **Portability:** ❌ Must be entirely replaced; see abstraction requirements document

### C2. OPLUS Cloud Sync (coloros.cloud / heytap.cloud)
- **Evidence quality:** VERIFIED
- **Source:** `com.heytap.cloud.sync.note.SyncNoteServive` (VERIFIED); `com.oplus.cloud.sync.note.SyncNoteServive` + `SyncDataProvider` (VERIFIED); `com.coloros.cloud.ACCESS_SYNC_SERVICE`, `heytap.permission.cloud.ACCESS_SYNC_SERVICE` permissions (VERIFIED); `oppo.permission.cloud.ACCESS_CLOUD`, `heytap.permission.cloud.ACCESS_CLOUD` (VERIFIED); `com.nearme.sync` queried
- **Details:** Proprietary delta-sync cloud backend for notes. Two sync service implementations exist (heytap/oplus variants for different OS versions). `SyncDataProvider` is the local content provider for sync state.
- **Portability:** ❌ Must be entirely replaced with a new sync backend

### C3. CloudKit SDK
- **Evidence quality:** VERIFIED
- **Source:** `com.heytap.cloudkit.libsync.service.CloudSyncService` (VERIFIED); `com.heytap.cloudkit.libcommon.provider.CloudAcrossProcDataProvider` (VERIFIED); `upd_cloudKit_libcommon`, `upd_cloudKit_libpay`, `upd_cloudKit_libsync` meta-data (VERIFIED)
- **Details:** OPLUS CloudKit SDK providing the low-level sync protocol (conflict resolution, encryption, delta diffs)
- **Portability:** ❌ Proprietary SDK; must be replaced

### C4. OPLUS Standard Identity (StdID)
- **Evidence quality:** STRONGLY SUPPORTED
- **Source:** `com.oplus.stdid` queried package; `upd_ac_service_sdk`, `upd_platform_account_net` meta-data references
- **Details:** OPLUS standardized identity framework providing device-level identity tokens beyond account-level auth
- **Portability:** ❌ OPLUS-specific; replace with app-level UUID or platform identity

### C5. DMP — Data Management Platform
- **Evidence quality:** VERIFIED
- **Source:** `com.oplus.dmp.SearchProvider.PERMISSION`, `com.oplus.dmp.IndexProvider.PERMISSION` permissions (VERIFIED); `com.oplus.dmp.sdk.analyzer.DictFileProvider` (VERIFIED); `NoteSearchInitializer`, `TodoSearchInitializer` (dmp variants) (VERIFIED); `com.oplus.metis.factdata.permission.DATABASE` (VERIFIED)
- **Details:** OPLUS Data Management Platform providing system-wide search indexing (makes note content searchable from system search). Also used for analytics/behavioral data collection.
- **Portability:** ❌ OPLUS-specific system search; replace with in-app search or standard Android `SearchProvider`

### C6. DRS — Data Reporting Service
- **Evidence quality:** VERIFIED
- **Source:** `com.oplus.framework.network.drs` queried; `com.oplus.drs.*` package listing
- **Details:** OPLUS proprietary telemetry/reporting service for analytics and crash reporting
- **Portability:** ❌ Replace with Firebase Analytics, Sentry, or remove

### C7. DCC — Data Collection & Crash
- **Evidence quality:** VERIFIED
- **Source:** `com.oplus.dcc.provider.TrackContentProvider` queried ContentProvider (VERIFIED); `DcsLoggerInitializer` (VERIFIED); `com.oplus.nearx.track.*` ContentProviders (VERIFIED)
- **Details:** OPLUS crash collection and data tracking SDK. Multiple ContentProviders for event, balance, and track data.
- **Portability:** ❌ Replace with standard crash/analytics SDK

### C8. Backup & Migration
- **Evidence quality:** VERIFIED
- **Source:** `com.oplus.migrate.backuprestore.plugin.NotePluginService`, `FavoriteNotePluginService`, `ThirdNotePluginService`, `IOSWirelessNotePluginService` (VERIFIED); `com.oplus.backup.sdk.*` package; `heytap.permission.PERMISSION_SHARED` (VERIFIED)
- **Details:** OPLUS backup/restore plugin framework; iOS wireless migration plugin suggests cross-platform data import feature
- **Portability:** ❌ OPLUS-specific backup framework; replace with standard SAF/backup or custom export

---

## D. AI / ML SDKs (Proprietary OPLUS)

### D1. AI Unit SDK
- **Evidence quality:** VERIFIED
- **Source:** `com.oplus.aiunit.*` packages (vision, av, handwritten, nlp, eraser, matting) (VERIFIED); `com.oplus.aiunit` queried package (VERIFIED); `aiunit_download_enable` meta-data (VERIFIED); `com.oplus.aiunit.auth_style` (VERIFIED); `libaiunit_sdk_core.so` (13 KB) (VERIFIED)
- **Details:** OPLUS on-device AI platform SDK providing modular AI capabilities. Sub-modules: vision (image understanding), av (audio/video), handwritten (HWR integration), nlp (text understanding), eraser (object removal), matting (background segmentation). Models downloaded on-demand (`aiunit_download_enable`).
- **Portability:** ❌ Proprietary OPLUS AI platform; each sub-module must be individually replaced with open alternatives (TFLite, ONNX models)

### D2. AI Paint
- **Evidence quality:** VERIFIED
- **Source:** `com.oplus.aipaint.*` package; `com.oplus.aipaint` queried; `com.oplus.paintplugin` queried (VERIFIED); `com.nearme.note.paint.NewPaintActivity`, `HandPaintNoteActivity` (VERIFIED)
- **Details:** AI-powered paint features: AI Graffiti (text-to-image sketch), AI-assisted drawing, paint plugin architecture
- **Portability:** ❌ Proprietary; replace with open generative image APIs or remove feature

### D3. AI Writer SDK
- **Evidence quality:** VERIFIED
- **Source:** `com.oplus.aiwriter.*` package; `com.oplus.aiwriter.sdk.KitSdkProvider` ContentProvider initializer (VERIFIED)
- **Details:** AI writing assistance: text summarization, continuation, rewriting, grammar correction
- **Portability:** ❌ Proprietary OPLUS AI writer; replace with LLM API (Gemini, OpenAI) or on-device model

### D4. Sunia Handwriting Engine (HTR)
- **Evidence quality:** VERIFIED
- **Source:** `com.sunia.*` packages; `libSuniaEngine.so` (14 MB), `libsuniabase.so` (2.1 MB) (VERIFIED); `com.sunia.common.provider.HWRProvider2` ContentProvider (VERIFIED)
- **Details:** Sunia is the primary handwriting-to-text recognition (HTR) engine. `HWRProvider2` is a ContentProvider exposing the recognition service. `libSNHTREngine.so` (6.9 MB) is a secondary HTR engine (likely for different script families).
- **Portability:** ❌ Proprietary; replace with Google MLKit Handwriting Recognition or on-device ONNX model

### D5. ONNX Runtime
- **Evidence quality:** VERIFIED
- **Source:** `libonnxruntime.so` (14 MB) in lib directory (VERIFIED)
- **Details:** Microsoft ONNX Runtime — open-source ML inference engine. Used to run ONNX-format models for various AI features (ink path estimation, math recognition, etc.)
- **Portability:** ✅ **OPEN SOURCE — FULLY PORTABLE.** ONNX Runtime has official Android, iOS, Web (WASM), and desktop builds. The models (.onnx files) can be reused if extracted.

### D6. OCR Client / Service
- **Evidence quality:** VERIFIED
- **Source:** `com.oplus.ocrclient.*` / `com.oplus.ocrservice.*` packages; `com.coloros.ocrscanner` / `com.coloros.ocrservice` queried (VERIFIED); `OcrConverterActivity` in manifest (VERIFIED)
- **Details:** OPLUS OCR (Optical Character Recognition) for extracting text from images within notes. Uses an external OCR service (`com.coloros.ocrservice`) via IPC.
- **Portability:** ❌ Depends on system OCR service; replace with Google MLKit Text Recognition or Tesseract

### D7. Smart Voice / ASR
- **Evidence quality:** VERIFIED
- **Source:** `com.oplus.osmartvoiceservicelib.*` package; `com.heytap.speechassist` / `com.coloros.speechassist` queried (VERIFIED); `com.coloros.speechassist.permission.SPEECH_SERVICE` permission (VERIFIED); `SpeechTransparentActivity` (VERIFIED); `com.oplus.note.speech.azure.api.AzureApiInitializer`, `com.oplus.note.speech.google.api.GoogleApiInitializer` (VERIFIED — two ASR backends!)
- **Details:** ASR (Automatic Speech Recognition) for voice notes. **Critically:** Two ASR backends are initialized — Azure Speech API and Google Speech API — alongside the OPLUS smart voice service. This suggests a fallback/regional switching architecture.
- **Portability:** ⚠️ Azure and Google ASR backends are portable; OPLUS smart voice service must be dropped

---

## E. Native C/C++ Libraries

All libraries reside in `apk-work/extracted/lib/arm64-v8a/`. Presence is **VERIFIED**; roles are **STRONGLY SUPPORTED** or **INFERRED** from names and sizes.

| # | Library | Size | Category | Role | JNI Interface | Portability |
|---|---|---|---|---|---|---|
| 1 | `libinkEngineNative.so` | 785 KB | Drawing | Vector ink stroke engine; pen pressure, velocity, width interpolation | VERIFIED (paint package) | ❌ Proprietary — must replace |
| 2 | `libpaint.so` | 6.6 MB | Drawing | Canvas rendering engine; compositing, layer management | STRONGLY SUPPORTED | ❌ Proprietary — must replace |
| 3 | `libSuniaEngine.so` | 14 MB | HTR/AI | Primary Sunia handwriting recognition engine | VERIFIED (HWRProvider2) | ❌ Proprietary — must replace |
| 4 | `libSNHTREngine.so` | 6.9 MB | HTR/AI | Secondary HTR engine (likely CJK/alternate scripts) | STRONGLY SUPPORTED | ❌ Proprietary — must replace |
| 5 | `libmathcaculate.so` | 1.8 MB | AI | Math formula solver / calculator recognition | STRONGLY SUPPORTED | ❌ Proprietary — consider open math solver |
| 6 | `libshapereco.so` | 258 KB | AI | Shape smoothing / geometric shape recognition | INFERRED | ❌ Proprietary — replaceable with open geometry lib |
| 7 | `libgesturereco.so` | 95 KB | AI | Gesture recognition (stroke gestures in paint) | INFERRED | ❌ Proprietary — small; re-implement |
| 8 | `libgraphicreco.so` | 500 KB | AI | Graphic / symbol recognition | INFERRED | ❌ Proprietary |
| 9 | `libgraphic.so` | 863 KB | Rendering | Graphics rendering utilities | INFERRED | ❌ Proprietary |
| 10 | `libnaiveEngine.so` | 1.3 MB | AI | Naive/local ML inference engine | INFERRED | ❌ Proprietary |
| 11 | `libnaiengine.so` | 436 KB | AI | AI inference engine (lighter companion to naiveEngine) | INFERRED | ❌ Proprietary |
| 12 | `libnbiengine.so` | 1.1 MB | AI | NBI (Neural Background Inference?) engine | INFERRED | ❌ Proprietary |
| 13 | `libCutoutEffect.so` | 303 KB | AI/VFX | AI image cutout / magic eraser effect | STRONGLY SUPPORTED (CutoutActivity) | ❌ Proprietary — replace with open segmentation |
| 14 | `libestimatedPathLib.so` | 1.6 MB | Drawing | Stroke path estimation / smoothing | STRONGLY SUPPORTED | ❌ Proprietary — replaceable with Perfect Freehand |
| 15 | `libforecast.so` | 222 KB | Drawing | Stroke prediction (reduces latency / improves ink feel) | STRONGLY SUPPORTED | ❌ Proprietary — replaceable with open prediction |
| 16 | `libonnxruntime.so` | 14 MB | AI Runtime | ONNX ML inference runtime (Microsoft) | VERIFIED | ✅ **Open source — fully portable** |
| 17 | `libvfxmagicediteffect.so` | 451 KB | VFX | Magic edit visual effects (AI image manipulation) | STRONGLY SUPPORTED | ❌ Proprietary |
| 18 | `libwatergradient.so` | 223 KB | Drawing | Watercolor gradient rendering effect | INFERRED | ❌ Proprietary — re-implement with shader |
| 19 | `libopluslog.so` | 62 KB | Logging | OPLUS-internal logging subsystem | VERIFIED (package name) | ❌ OPLUS-specific — drop, use standard logging |
| 20 | `libsjk.so` | 5.1 MB | Security | Security/auth library (exact purpose UNKNOWN) | UNKNOWN | ❌ Likely OPLUS security framework |
| 21 | `libsuniabase.so` | 2.1 MB | HTR/AI | Sunia base library (shared between Sunia components) | STRONGLY SUPPORTED | ❌ Proprietary (Sunia ecosystem) |
| 22 | `libauthlib.so` | 7.7 MB | Auth | Authentication library (HeyTap account/DRM) | STRONGLY SUPPORTED | ❌ Proprietary auth |
| 23 | `libtbljniutils.so` | 18 KB | WebView | TBL WebView JNI utility bridge | VERIFIED (manifest) | ❌ TBL-specific — stub needed |
| 24 | `libwbkit-seckit3.so` | 143 KB | Security | WBKit security kit v3 (WebView security layer) | INFERRED | ❌ OPLUS-specific |
| 25 | `libwb_tables_549543368749780587_1.so` | 218 KB | WebView | TBL WebView internal lookup tables | INFERRED | ❌ TBL-specific |
| 26 | `libaiunit_sdk_core.so` | 13 KB | AI | AI Unit SDK core (thin JNI stub for AI Unit SDK) | VERIFIED (package) | ❌ OPLUS AI platform |
| 27 | `liblangdetectadapter.so` | 193 KB | AI/NLP | Language detection adapter | INFERRED | ❌ Likely wraps OPLUS NLP — replace with CLD or langdetect |

**Summary:** 1 of 27 libraries (`libonnxruntime.so`) is open-source and portable. 26 are proprietary OPLUS/Sunia libraries requiring replacement or stubbing.

---

## F. External Application Integrations

These depend on other apps being installed on the device, accessed via Android Intents or ContentProviders.

| Integration | Mechanism | Evidence | Notes App Feature | Portability |
|---|---|---|---|---|
| **OShare (Touch Share)** | OPLUS P2P share permission + service | VERIFIED | Share note to nearby OPLUS device | ❌ OPLUS-only; remove on non-OPLUS |
| **Calendar App** | `ACTION_INSERT` + `vnd.android.cursor.dir/event` | INFERRED from intent queries | Create calendar event from note/todo | ✅ Standard Android intent |
| **Contacts App** | `ACTION_INSERT_OR_EDIT`, `ACTION_PICK` | VERIFIED (manifest_names) | Insert/pick contacts for note cards | ✅ Standard Android intent |
| **Phone / Dialer** | `ACTION_DIAL` intent | VERIFIED (manifest_names) | Dial from contact card in note | ✅ Standard Android intent |
| **OPLUS File Manager** | `oppo/oplus.intent.action.filemanager.BROWSER_FILE` | VERIFIED (manifest) | Attach document files | ⚠️ OPLUS-specific; also queries `andes.oplus.documentsreader` |
| **Camera App** | `ACTION_IMAGE_CAPTURE` implicit intent | STRONGLY SUPPORTED | Insert photo | ✅ Standard Android intent |
| **Gallery / Photos** | `ACTION_PICK` / `ACTION_VIEW image/*` | VERIFIED (manifest) | Pick image for note | ✅ Standard Android intent |
| **Browser** | `ACTION_VIEW` / `ACTION_INSERT` bookmark | VERIFIED (manifest) | Web card / URL card creation | ✅ Standard Android intent |
| **WPS Office (cn.wps.moffice.lite)** | Explicit package query | VERIFIED (manifest) | Open/view document attachments | ⚠️ Prefers WPS; standard `ACTION_VIEW` fallback |
| **Sound Recorder** | `com.coloros.soundrecorder` / `com.oneplus.soundrecorder` | VERIFIED (manifest) | External recorder integration | ⚠️ OPLUS-specific; standard MediaRecorder in-app |
| **OPLUS AI Memory** | `com.oplus.aimemory` queried | VERIFIED | Smart capture / memory AI | ❌ OPLUS-specific AI feature |
| **OPLUS Assistant Screen** | `com.coloros.assistantscreen` queried | VERIFIED | Assistant sidebar integration | ❌ OPLUS-specific |
| **HeyTap VIP** | `com.heytap.vip` / `com.oplus.vip` queried | VERIFIED | Premium features gating | ❌ OPLUS subscription service |
| **IPE Manager (Stylus)** | `com.oplus.ipemanager.action.pencil_setting_from_notes` | VERIFIED | OPLUS Pencil settings | ❌ OPLUS stylus ecosystem |
| **Sell Mode** | `com.coloros.note.action.SELLMODE_RESET` | VERIFIED | Demo/kiosk mode reset | ❌ OEM-specific; remove |

---

## G. Hardware-Dependent Features

| Feature | Android API | Evidence | OPLUS-Specific? | Portability |
|---|---|---|---|---|
| **Stylus / Pen Pressure** | `android.view.MotionEvent` (ACTION_DOWN, TOOL_TYPE_STYLUS, pressure, tilt) | STRONGLY SUPPORTED (`libinkEngineNative.so`, IPE Manager integration) | Partially — standard Android Stylus API used; OPLUS IPE Manager for settings UI | ⚠️ Standard API; IPE Manager settings OPLUS-specific |
| **Vibration / Haptics** | `android.permission.VIBRATE` + `VibrationEffect` | VERIFIED (permission in manifest) | No | ✅ Standard Android |
| **Camera (Hardware)** | Camera2 / CameraX | STRONGLY SUPPORTED | No | ✅ Standard Android |
| **Microphone** | `android.permission.RECORD_AUDIO` + `MediaRecorder` | VERIFIED (permission in manifest) | No | ✅ Standard Android |
| **Multi-touch Touchscreen** | `android.view.MotionEvent` multi-pointer | STRONGLY SUPPORTED (drawing, gesture recognition) | No | ✅ Standard Android |

---

## Android Manifest Analysis

**Package:** `com.coloros.note`  
**Version:** 16.7.5 (versionCode 164070005) — VERIFIED  
**Application Class:** `com.nearme.note.MyApplication`  
**minSdkVersion:** 31 (Android 12) | **targetSdkVersion:** 35 (Android 15)

### Permissions by Category

#### Dangerous Permissions (require runtime grant)
| Permission | Purpose | Evidence Quality |
|---|---|---|
| `android.permission.RECORD_AUDIO` | Voice note recording, ASR | VERIFIED |
| `android.permission.POST_NOTIFICATIONS` | Note reminders, audio player notification | VERIFIED |
| `android.permission.READ_FRAME_BUFFER` | Screenshot capture for note export | VERIFIED |
| `android.permission.SCHEDULE_EXACT_ALARM` | Exact time reminders/alarms | VERIFIED |
| `android.permission.SYSTEM_ALERT_WINDOW` | Screen-on note creation overlay | VERIFIED |

> [!NOTE]
> `READ_CONTACTS`, `CAMERA`, `READ_MEDIA_IMAGES` are NOT in the manifest's `uses-permission` section (they may be declared by imported SDKs or triggered via intent). Camera and gallery access appears to be done via intents (`ACTION_IMAGE_CAPTURE`, `ACTION_PICK`) which do not require these permissions directly.

#### Normal / Signature Permissions
| Permission | Purpose |
|---|---|
| `android.permission.INTERNET` | Cloud sync, AI APIs, analytics |
| `android.permission.ACCESS_NETWORK_STATE` | Network check before sync |
| `android.permission.ACCESS_WIFI_STATE` | Wi-Fi sync preference |
| `android.permission.FOREGROUND_SERVICE` | Audio recording service, sync service |
| `android.permission.FOREGROUND_SERVICE_DATA_SYNC` | Explicit data-sync foreground service type |
| `android.permission.RECEIVE_BOOT_COMPLETED` | Reschedule alarms on boot |
| `android.permission.WAKE_LOCK` | Keep CPU alive during sync/recording |
| `android.permission.VIBRATE` | Haptic feedback |
| `android.permission.TURN_SCREEN_ON` | Screen-on note creation |
| `android.permission.QUERY_ALL_PACKAGES` | Detect installed apps (OPLUS features, sound recorder, etc.) |

#### OPLUS-Specific Permissions
| Permission | Purpose |
|---|---|
| `com.coloros.cloud.ACCESS_SYNC_SERVICE` | Access ColorOS cloud sync |
| `oppo.permission.cloud.ACCESS_CLOUD` | Legacy OPPO cloud access |
| `heytap.permission.cloud.ACCESS_CLOUD` | HeyTap cloud access |
| `heytap.permission.cloud.ACCESS_SYNC_SERVICE` | HeyTap sync service |
| `com.coloros.speechassist.permission.SPEECH_SERVICE` | ColorOS speech assist service |
| `com.oplus.interconnect.permission.SERVICE` | OPLUS inter-app communication |
| `com.oplus.permission.safe.AI_APP` | OPLUS AI app sandbox permission |
| `com.oplus.permission.safe.SAU` | OPLUS security audit |
| `com.oplus.permission.safe.APP_MANAGER` | OPLUS app manager access |
| `com.oplus.permission.safe.PROTECT` | OPLUS protection framework |
| `com.oplus.permission.safe.WINDOW` | OPLUS window management |
| `com.oplus.permission.safe.AUTHENTICATE` | OPLUS authentication |
| `com.oplus.permission.safe.SECURITY` | OPLUS security |
| `com.oplus.permission.safe.SETTINGS` | OPLUS settings access |
| `com.oplus.permission.safe.BACKUP` | OPLUS backup permission |
| `com.oplus.permission.safe.PRIVATE` | OPLUS private space |
| `com.oplus.permission.safe.IOT` | OPLUS IoT integration |
| `com.oplus.ipemanager.permission.receiver.DOUBLE_CLICK` | OPLUS stylus double-click |
| `com.oplus.oshare.permission.READ_OSHARE_PROVIDER` | OShare P2P sharing |
| `com.oplus.dmp.SearchProvider.PERMISSION` | DMP search indexing |
| `com.oplus.dmp.IndexProvider.PERMISSION` | DMP index write |
| `com.oplus.metis.factdata.permission.DATABASE` | Metis fact database |
| `com.oplus.pay.recombine` | OPLUS Pay integration |
| `oppo.permission.OPPO_COMPONENT_SAFE` | Legacy OPPO component security |
| `oplus.permission.OPLUS_COMPONENT_SAFE` | OPLUS component security |
| `com.android.launcher.permission.READ_SETTINGS` | Launcher settings |
| `com.android.launcher.permission.WRITE_SETTINGS` | Launcher settings write |
| `net.oneplus.launcher.permission.READ_BACKUP` | OnePlus launcher backup |
| `com.heytap.datamigration.PERMISSION_SHARED` | HeyTap data migration |

### Key Application Components

#### Activities (Selected)
| Activity | Purpose |
|---|---|
| `MainActivity` | Primary launcher activity |
| `NoteViewRichEditActivity` | Rich text note editor (hosts TBL WebView) |
| `QuickNoteViewRichEditActivity` | Quick note (lockscreen/sidebar) editor |
| `PaintActivity` / `NewPaintActivity` / `HandPaintNoteActivity` | Drawing note activities |
| `QuickPaintActivity` | Lockscreen quick paint |
| `AIGraffitiResultActivity` / `QuickNoteAIGraffitiActivity` | AI Graffiti (text-to-sketch) |
| `OcrConverterActivity` | OCR handwriting → text |
| `CutoutActivity` / `EnhancePicActivity` | AI image cutout / enhance |
| `SuperTextActivity` | SuperText AI extraction |
| `ExportPdfActivity` | PDF export |
| `SpeechTransparentActivity` | Voice transcription overlay |
| `TodoListActivity` / `TodoDetailActivity` | Todo management |
| `SettingsSyncSwitchActivity` | Cloud sync settings |
| `BigModelInfoActivity` | Large model / AI settings |

#### Services (Selected)
| Service | Purpose |
|---|---|
| `NotificationForegroundService` | Audio recording foreground service |
| `AudioPlayNotificationService` | Audio playback notification |
| `NoteService` / `AICollectService` | Note data + AI telemetry services |
| `SyncNoteServive` (×2) | Cloud sync (heytap + oplus variants) |
| `CloudSyncService` | CloudKit sync service |
| `SellModeService` / `SellResetService` | Demo mode services |
| `TouchShareService` | OShare P2P share |
| `TBLPrivilegedProcessService0–4` | TBL WebView renderer processes |
| WorkManager services (×3) | Background task scheduling |

#### Broadcast Receivers (Selected)
| Receiver | Purpose |
|---|---|
| `AlarmUtils$AlarmReceiver` | Note alarm delivery |
| `TheLocaleChangeReceiver` | Language change handling |
| `NoteWidgetProvider` / `ToDoWidgetProvider` | Home screen widgets |
| `ProfileInstallReceiver` | Baseline profile installer |
| WorkManager constraint proxies (×4) | WorkManager constraint monitoring |
| `UCReceiver` | User Center account events |
| `PaySdkReceiver` | OPLUS Pay events |

#### ContentProviders (Selected)
| Provider | Authority | Purpose |
|---|---|---|
| `NotesProvider` | `com.coloros.note.notesprovider` | External note access API (protected by `OPPO_COMPONENT_SAFE`) |
| `NoteFileProvider` | (FileProvider) | Secure file URI sharing |
| `SyncDataProvider` | `com.coloros.note.sync` | Cloud sync state |
| `NoteCardWidgetProvider` | `com.coloros.note.cardwidget` | Pantanal card data |
| `EponaProvider` | Epona | OPLUS IPC routing |
| `HWRProvider2` | Sunia | Handwriting recognition service |
| `CloudAcrossProcDataProvider` | CloudKit | Cross-process cloud data |
| DCC / NearX track providers (×4) | Various | Analytics/telemetry |

---

## Portability Impact Summary

| Dependency Area | Portability to Stock Android | Portability to Web | Portability to Desktop | Blocking Reason |
|---|---|---|---|---|
| A. Standard Android / Portable | ✅ None required | ⚠️ Abstraction needed | ⚠️ Abstraction needed | N/A |
| B1. TBL WebView | ❌ Replace with standard WebView | ⚠️ Embed in iframe/CEF | ⚠️ Use CEF/Electron | `showHandles` API, JNI bridge |
| B2. OPLUS Physics Engine | ❌ Replace with DynamicAnimation | ✅ Web Animations API | ✅ CSS/JS animations | Proprietary library |
| B3-B10. Other OPLUS System | ❌ Remove/reimplement | ❌ Remove/reimplement | ❌ Remove/reimplement | All proprietary |
| C1-C8. HeyTap Cloud/Account | ❌ Replace entirely | ❌ Replace entirely | ❌ Replace entirely | Proprietary cloud infra |
| D1-D3. OPLUS AI SDKs | ❌ Replace with open SDKs | ❌ Replace with open SDKs | ❌ Replace with open SDKs | Proprietary AI platform |
| D4. Sunia HTR | ❌ Replace (MLKit/ONNX) | ❌ Replace (ONNX WASM) | ❌ Replace (ONNX) | Proprietary models |
| D5. ONNX Runtime | ✅ Direct reuse | ✅ ONNX WASM | ✅ ONNX native | Open source |
| D6. OCR Client | ❌ Replace (MLKit) | ❌ Replace (Tesseract.js) | ❌ Replace (Tesseract) | System service dependency |
| D7. ASR (Azure/Google) | ✅ Azure/Google SDK portable | ✅ Azure/Google Web SDK | ✅ Azure/Google SDK | Already multi-backend |
| E. Native libs (26 proprietary) | ❌ Replace all | ❌ Replace all | ❌ Replace all | Proprietary ARM binaries |
| E. ONNX Runtime lib | ✅ Reuse | ✅ WASM build | ✅ Reuse | Open source |
| F. Standard intents | ✅ Direct use | ❌ Web APIs instead | ⚠️ OS-specific | N/A |
| F. OPLUS-specific intents | ❌ Remove/replace | ❌ Remove | ❌ Remove | OPLUS ecosystem only |
| G. Hardware APIs | ✅ Standard Android | ⚠️ Web APIs (getUserMedia) | ⚠️ OS APIs | N/A |
