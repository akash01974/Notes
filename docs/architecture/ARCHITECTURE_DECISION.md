# Architecture Decision Record (ADR) — ColorOS Notes Replica

| Field | Value |
|---|---|
| **Status** | RECOMMENDATION RECORD — Pending User Approval |
| **Date** | 2026-11-02 |
| **Document ID** | ADR-007 |
| **Scope** | Cross-Platform Architecture, Editor Host, Storage, and Synchronization Selection |
| **Decision Gates** | **STOP POINT**: Requires explicit user authorization before application scaffolding or implementation begins. |

---

## 1. Executive Decision Summary

Based on comprehensive static reverse engineering, decompiled bytecode inspection, Room v47 database mapping, native library classification, standalone browser smoke testing (15/15 PASS), and multi-criteria decision analysis (MCDA), the recommended architecture is:

> **Primary Recommendation:**
> **Flutter UI Shell + Embedded TipTap Editor (`flutter_inappwebview`) + Local Drift (SQLite) Store + Open Supabase Cloud Sync Engine.**

```
+─────────────────────────────────────────────────────────────────────────────────────────────+
|                                RECOMMENDED SYSTEM ARCHITECTURE                              |
+─────────────────────────────────────────────────────────────────────────────────────────────+
  ┌─────────────────────────────────────────────────────────────────────────────────────────┐
  │                            Flutter Application Shell (Dart)                             │
  │  - Authentic ColorOS (COUI) Design System (Spring Physics, 120 FPS, Pixel Fidelity)    │
  │  - Universal Native Targets: Android (All OEMs), Linux (Wayland/X11), Windows, macOS    │
  │  - Native Replacement Canvas: Skia/Impeller Vector Drawing Engine (replaces libpaint.so)│
  │  - Audio Recorder & Player Engine: MP3 Stream Capture + Synchronized LRC Timeline Parser│
  └────────────────────────────────────────────┬────────────────────────────────────────────┘
                                               │
                               Bidirectional WVJB Bridge
                       (188 Native Handlers / 107 JS Interfaces)
                                               │
                                               ▼
  ┌─────────────────────────────────────────────────────────────────────────────────────────┐
  │                           Editor Host Container (WebView)                               │
  │  - Unchanged Production TipTap / ProseMirror Vue 3 Bundle (assets/tiptap/index.js)     │
  │  - Zero Regressions: Identical Tables, Heading Marks, Lists, and Block Styling         │
  │  - Clean Host Shim: Intercepts injectedObject.* and Polyfills TBL showHandles API       │
  └────────────────────────────────────────────┬────────────────────────────────────────────┘
                                               │
                                               ▼
  ┌─────────────────────────────────────────────────────────────────────────────────────────┐
  │                       Local-First Database & Storage Engine                             │
  │  - Drift ORM over Native SQLite3 C-Library (Strict Room v47 14-Table Schema)            │
  │  - Content-Addressable Asset Store (UUID / MD5 verification in AppData / sandbox)       │
  │  - WAL Journal Concurrency (Zero-latency offline reading & writing)                     │
  └────────────────────────────────────────────┬────────────────────────────────────────────┘
                                               │
                               Delta Sync via Outbox Queue
                           (State 0=New, 1=Synced, 2=Modified)
                                               │
                                               ▼
  ┌─────────────────────────────────────────────────────────────────────────────────────────┐
  │                             Open Cloud Backend (Supabase)                               │
  │  - PostgreSQL Store mirroring Room v47 DDL + S3-Compatible Object Storage for Blobs     │
  │  - Zero-Knowledge End-to-End Encryption (Argon2id + XChaCha20-Poly1305)                 │
  │  - 100% Self-Hostable via Docker Compose or Hosted Cloud                                │
  └─────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Strongest Alternative: Candidate A (Vue 3 + Capacitor / Tauri 2.0)

If the user prefers a single-language **web-native ecosystem** (TypeScript across the entire stack):
- **Architecture**: Vue 3 application rendering COUI components with Tailwind CSS / SCSS tokens, hosting TipTap directly in the DOM, packaged via Capacitor 6 on Android and Tauri 2.0 on desktop.
- **Why It Was Runner-Up**:
  - Provides zero-bridge overhead for the editor (app and editor share the DOM).
  - Tauri desktop binaries are extremely lightweight (~10 MB, ~35 MB RAM).
- **Why It Was Not Primary**:
  - Mobile scrolling and animation performance on non-flagship Android devices lags behind Flutter's compiled GPU canvas.
  - Tauri on Linux Wayland (specifically Arch Linux / Hyprland) suffers from WebKitGTK input method (IME) composition quirks and fractional scaling issues.
  - Requires maintaining two separate SQLite driver bindings (`rusqlite` in Rust vs Capacitor SQLite on mobile).

---

## 3. Explicit Justification for Rejecting Other Candidates

### 3.1 Rejection of Candidate C: Compose Multiplatform (CMP)
- **Primary Blocking Defect**: **Lack of a First-Class Desktop WebView Engine**. While Compose on Android uses the platform WebView flawlessly, Compose Multiplatform on desktop lacks an official webview. Workarounds require either bundling `KCEF` (a third-party Chromium Embedded Framework binding that downloads a 150 MB binary on desktop startup) or outdated JavaFX WebEngine (which fails on modern ProseMirror ES6 syntax).
- **Distribution Bloat**: Desktop distribution requires bundling a Java Runtime Environment (JRE) via Conveyor / `jpackage`, resulting in 180–250 MB installer sizes and 150+ MB idle RAM.
- **Wayland IME Bugs**: Documented open issues in Skiko/CMP regarding Wayland CJK and composite character text input.

### 3.2 Rejection of Candidate D: React Native + Electron
- **Primary Blocking Defect**: **Architectural Divergence and Resource Bloat**. React Native for Android and Electron for desktop share almost no UI code (JSX `<View>` vs HTML `<div>`). Maintaining two separate bridge implementations (TurboModules vs Electron IPC) doubles development overhead.
- **Memory Footprint**: Electron idle memory regularly exceeds 250–400 MB, violating the lightweight utility goal for a desktop notes application.
- **Linux Abandonment**: React Native Desktop for Linux is unmaintained by the community.

---

## 4. Key Subsystem Decisions

### 4.1 Editor Engine Decision: Strategy 3 (Hybrid Clean Host)
- **Decision**: Mount the unchanged production TipTap editor bundle (`assets/tiptap/index.js`) inside the webview using a clean, strongly typed Dart-to-JavaScript bridge shim.
- **Rationale**:
  - Standalone browser execution has been mathematically proven (15/15 PASS in headless Chromium).
  - Rebuilding the editor from scratch in TipTap 2.x introduces immense regression risk for custom table borders, `multi-heading` nodes, and block styles.
  - Isolates proprietary OPPO APIs: all calls to `window.injectedObject.*` are safely handled by the host without executing closed-source OPPO code.

### 4.2 Local Database Decision: Drift (SQLite3 C-Bindings)
- **Decision**: Implement the 14-table Room v47 schema using Drift (`drift` / `drift_flutter`).
- **Rationale**:
  - Compiles raw SQL DDL matching AndroidX Room into type-safe Dart classes.
  - Uses the official SQLite C-library (`sqlite3.so` / `sqlite3.dll` / `sqlite3.dylib`), guaranteeing 100% identical SQL behavior across Android, Linux, Windows, and macOS.
  - Provides reactive Dart streams (`Stream<List<RichNote>>`) that automatically trigger UI re-renders on database writes.

### 4.3 Drawing Engine Decision: Flutter CustomPainter Vector Canvas
- **Decision**: Re-implement the drawing canvas natively in Flutter using `CustomPainter` on Skia/Impeller, storing stroke paths in open structured JSON and exporting preview PNGs to `PaintInfo.imagePath`.
- **Rationale**:
  - The proprietary ColorOS C++ libraries (`libpaint.so`, `libinkEngineNative.so`) cannot be ported.
  - Native Flutter canvas handles stylus pressure (`PointerEvent.pressure`), tilt, and high-frequency touch events with sub-16ms latency.
  - Preserves 100% compatibility with TipTap's `ot(s)` paint node without executing proprietary binaries.

### 4.4 Cloud Synchronization Decision: Open Supabase (PostgreSQL + S3)
- **Decision**: Use Supabase as the primary cloud backend, supporting both self-hosted Docker and hosted instances.
- **Rationale**:
  - PostgreSQL schema maps directly to SQLite Room v47 tables without relational distortion.
  - Built-in S3-compatible Object Storage handles image, video, and audio attachment blobs with signed URLs.
  - Fully decoupled: The local client functions 100% offline; sync runs asynchronously in the background.

---

## 5. Comprehensive Risk Register & Mitigations

| Risk ID | Description | Severity | Likelihood | Mitigation Strategy |
|---|---|:---:|:---:|---|
| **R1** | Linux Desktop WebKitGTK Wayland / IME issues | High | Medium | Test with `WEBKIT_FORCE_COMPOSITING_MODE=1` environment variable. If unresolvable on Hyprland, provide an isolated CEF / Chromium runtime desktop fallback option. |
| **R2** | Large Document Bridge Serialization Latency | Medium | Low | Large text payloads (`onContentJsonUpdate`) are debounced at 500ms. Attachment binary data is transferred directly via local filesystem paths, never over the bridge channel. |
| **R3** | Proprietary `.bin` Paint Data Loss on Import | Medium | High | Old `.bin` stroke files from original ColorOS devices cannot be parsed directly. Provide an automatic fallback that imports the existing rendered `.png` preview as an editable image block. |
| **R4** | Background Sync Throttling on Android 14+ | Medium | Medium | Use AndroidX `WorkManager` (`workmanager` Flutter plugin) adhering to standard Android power management guidelines and battery-optimization exemption prompts. |
| **R5** | Audio Codec Compatibility Across Desktop OSes | Low | Low | Standardize strictly on MP3 (44.1 kHz, mono) for recording and playback. MP3 decoders/encoders are universally supported without proprietary licensing constraints. |

---

## 6. Unresolved Technical Questions

1. **Linux Desktop Wayland Touchscreen Gestures**: Does `flutter_inappwebview` receive multi-touch pinch-to-zoom gestures correctly under Wayland compositors (Hyprland / Sway), or does it require XWayland fallback? (To be verified in Milestone 3).
2. **Optimal Local HTR / Speech Model Weight**: For offline speech recognition, should we package a lightweight Whisper ONNX model (~39 MB) with the desktop installer, or make it an optional on-demand download?

---

## 7. Cost, Licensing & Maintenance Implications

- **Software Licensing**:
  - Core Client Shell: 100% Open Source (Flutter / Dart / SQLite / MIT / BSD licenses).
  - Editor Engine: Minified Vue 3 / TipTap / ProseMirror (MIT licenses).
  - Zero Proprietary Binary Linking: No closed-source OPPO C++ libraries (`.so`) are packaged or distributed.
- **Operational Costs**:
  - Local-Only Mode: **$0.00** (Free, fully functional offline).
  - Self-Hosted Sync: **$0.00** (Runs on user's existing hardware or $5/mo VPS via Docker).
  - Cloud Sync (Hosted): Free tier of Supabase covers up to 500 MB database and 1 GB file storage (thousands of typical notes).

---

## 8. Decision Gates Requiring User Approval

Before any application code, scaffolding, or framework configuration begins, the user must explicitly review and authorize:

1. **Client Framework Approval**: Confirm **Candidate B (Flutter Shell + Embedded TipTap WebView)** as the primary application architecture (or select Candidate A as alternative).
2. **Editor Strategy Approval**: Confirm **Strategy 3 (Hybrid Clean Host reusing unchanged `assets/tiptap/index.js` bundle)**.
3. **Cloud Backend Strategy Approval**: Confirm **Supabase / PostgreSQL local-first sync architecture** (or mandate Local-Only / WebDAV).
4. **Drawing Canvas Strategy Approval**: Confirm native vector canvas replacement (storing open JSON strokes + PNG preview) in place of attempting to reverse closed `.bin` files.

---

*Phase 1 Milestone 2 complete. Awaiting user architecture decision.*
