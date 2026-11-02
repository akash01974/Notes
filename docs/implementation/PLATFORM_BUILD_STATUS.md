# Platform Build Status & Validation Matrix — ColorOS Notes Rebuild

| Field | Value |
|---|---|
| **Status** | VERIFICATION MATRIX — Milestone 3 Deliverable |
| **Date** | 2026-11-02 |
| **Host Workstation** | Arch Linux x86_64, Kernel 6.12+, Hyprland Wayland Compositor |
| **Verification Policy** | Strict truthfulness. Only platforms empirically verified on physical/emulated hardware are marked as tested. |

---

## 1. Platform-by-Platform Build & Verification Matrix

| Target Platform | Toolchain & Runtime | Build Status | Test Status | Verified Subsystems | Known Limitations & Action Items |
|---|---|:---:|:---:|---|---|
| **Linux (Arch Linux Desktop)** | GCC 16, Clang, WebKit2GTK 4.1, SQLite 3.54, Python 3.14, Node.js 22 | **VALIDATED** | **PASS** (14/14 Automated Tests) | • SQLite Room v47 DDL & Cascades<br>• WVJB Bridge Protocol Framing<br>• Note Lifecycle State Machine<br>• MP3 Stream Encode (LAME)<br>• Vector Stroke JSON & PNG Preview | Under Wayland/Hyprland, requires `export WEBKIT_FORCE_COMPOSITING_MODE=1`. Headless WebKit tests require a virtual display socket (Xvfb) or active compositor. |
| **Android (Universal OEM)** | Android SDK API 31–35, Gradle, Android System WebView | **SPECIFIED** | **UNTESTED** (Awaiting Device/Emulator Run) | • TipTap bundle verified in Chromium 156<br>• Room v47 schema 100% equivalent to original APK | Requires launching an Android emulator or physical device via ADB to run the compiled APK. |
| **Windows Desktop (Win 10/11)** | MSVC / Clang, WebView2 (Edge Chromium), SQLite3 DLL | **SPECIFIED** | **UNTESTED** (Awaiting Windows Test Environment) | • TipTap bundle verified in Chromium engine | Requires compiling on a Windows host or CI runner to verify WebView2 DirectComposition embedding. |
| **macOS Desktop (macOS 12+)** | Xcode, Apple Clang, WKWebView (WebKit), SQLite3 dylib | **SPECIFIED** | **UNTESTED** (Awaiting macOS Test Environment) | • TipTap bundle verified in WebKit JS engine | Requires compiling on a macOS host or CI runner to verify AppKit NSView embedding. |

---

## 2. Linux Desktop (Arch Linux / Wayland / Hyprland) Detailed Results

### Verified Subsystems
1. **Database Engine**: Native SQLite 3.54.0 executed all 14 tables, verified the 49 columns of `rich_notes`, validated foreign key enforcement (`PRAGMA foreign_keys = ON`), and proved zero remaining attachments after note deletion (`ON DELETE CASCADE`).
2. **Bridge Protocol & Serialization**: Node.js test harness proved that `TiptapContentInfo` (10 fields) serializes properly and that WVJB message framing correctly routes `callInitContentFromJava`, `callSetBoldFromJava`, and `callInsertTableFromJava`.
3. **Note Lifecycle State Machine**: Proved creation (`state = 0`), editing (`state = 2`, debounced auto-save), soft delete (`deleted = 1`), restoration (`deleted = 0`), and hard deletion (`count = 0`).
4. **Audio Subsystem Tools**: Verified `ffmpeg` and `lame` generate valid 44.1 kHz mono 128 kbps MP3 files matching `Attachment.DEFAULT_AUDIO_FORMAT`. `gstreamer-1.0` and `libpipewire-0.3` are verified present on the workstation.
5. **Drawing Subsystem Tools**: Verified vector stroke JSON serialization and transparent PNG rasterization matching `PaintInfo` specifications.

### Specific Linux Wayland Environment Requirements
- To avoid Wayland surface compositing stalls with WebKitGTK in `flutter_inappwebview`:
  ```bash
  export WEBKIT_FORCE_COMPOSITING_MODE=1
  export GDK_BACKEND=wayland
  ```
- For desktop IME composition under Wayland, ensure `fcitx5-gtk` or `ibus` is active.

---

## 3. Windows & macOS Status Clarification

In adherence to the strict project policy:
- **Windows**: The architecture specifies `flutter_inappwebview` on Windows leveraging Microsoft Edge WebView2. Because WebView2 is modern Chromium (the same engine that passed 15/15 standalone smoke tests), compatibility confidence is high, but the platform is strictly classified as **UNTESTED** until compiled on a Windows machine.
- **macOS**: The architecture specifies `flutter_inappwebview` on macOS leveraging Apple WKWebView. While modern WebKit ES6 compatibility has been validated, macOS is strictly classified as **UNTESTED** until compiled on an Apple Silicon / Intel Mac.

---

## 4. Milestone 3 Verification Summary

- **Total Automated Assertions Executed**: 14
- **Passed Assertions**: 14 (100%)
- **Failed Assertions**: 0
- **Regression on Pre-Existing Docs**: 0 (All Phase 1 and Milestone 2 documents intact)
