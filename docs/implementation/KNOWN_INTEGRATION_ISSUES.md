# Known Integration Issues — Milestone 3.1

**Project**: ColorOS Notes Cross-Platform Replica  
**Milestone**: 3.1 — Flutter Integration Verification  
**Date**: 2026-11-02  
**Status**: BLOCKED (Flutter SDK not installed)

---

## Summary

Milestone 3 produced a complete Flutter project scaffold with a correct 49-column
Room v47 SQLite schema, an isolated WebView bridge host, and 14/14 automated
shell-based tests that PASS without the Flutter SDK. However, actual Dart
compilation and runtime verification are impossible until the issues below are
resolved.

---

## Issue 1 — Flutter SDK Not Installed [CRITICAL / BLOCKING]

**Severity**: CRITICAL  
**Status**: UNRESOLVED — awaiting user authorization to install

**Description**  
Neither `flutter` nor `dart` are present anywhere on the system. A `find`
sweep of `/home/akash`, `/usr/local`, `/opt`, and `/var` returned no results.
No `pubspec.lock` has ever been generated.

**Impact**  
- `flutter pub get` cannot run → dependencies remain unresolved  
- `dart run build_runner build` cannot run → generated code absent  
- `flutter analyze` cannot run → Dart static analysis unavailable  
- `flutter test` cannot run → Dart unit tests cannot execute  
- `flutter build linux` cannot run → no Linux executable produced  
- `flutter build apk --debug` cannot run → no Android APK produced  
- **All Dart-level verification is deferred until SDK is installed**

**Resolution options**  
A. User installs Flutter SDK themselves:
   ```bash
   yay -S flutter          # Arch Linux AUR (recommended on this system)
   # or
   # Download from https://docs.flutter.dev/get-started/install/linux
   # and add to PATH
   ```
B. User grants explicit authorization for the agent to install via `yay`.

**Do not resolve this issue silently. Explicit user authorization is required.**

---

## Issue 2 — `drift_database.g.dart` Missing [HIGH / BLOCKING]

**Severity**: HIGH  
**Status**: UNRESOLVED — blocked by Issue 1

**Description**  
`app/lib/data/database/drift_database.dart` declares `@DriftDatabase` and
references the `RichNotes`, `Attachments`, `Folders`, and `Tags` table
classes. The companion generated file `drift_database.g.dart` must be produced
by `dart run build_runner build`. It has never been generated because Dart is
unavailable.

**Impact**  
- `ColorOsNotesDatabase` class is not compilable as-is  
- All Drift DAO methods (`insertNote`, `watchAllNotes`, etc.) are unresolved  
- `note_repository_impl.dart` cannot be migrated to the Drift layer

**Affected files**  
- `app/lib/data/database/drift_database.dart` (references generated symbols)  
- `app/lib/data/database/tables.drift` (source of generated schema)  
- `app/lib/data/repositories/note_repository_impl.dart` (depends on Drift DB)

**Resolution**  
Once Dart SDK is available:
```bash
cd /home/akash/Projects/Notes/app
dart run build_runner build --delete-conflicting-outputs
```
Commit the generated `drift_database.g.dart` to the repository.

---

## Issue 3 — `note_repository_impl.dart` Wired to Legacy Direct-SQLite Layer [HIGH]

**Severity**: HIGH  
**Status**: UNRESOLVED — blocked by Issues 1 and 2

**Description**  
`app/lib/data/repositories/note_repository_impl.dart` imports and depends on
`AppDatabase` from `app_database.dart`, which wraps the `sqlite3` package
directly (raw `sqlite3.Database`). The Drift ORM layer (`ColorOsNotesDatabase`
from `drift_database.dart`) was added in Milestone 3.1 but is not yet wired
into any repository.

Both layers correctly implement the Room v47 49-column schema, but the
application currently bypasses Drift's type-safe DAO layer entirely.

**Impact**  
- Drift's reactive streams (`watchAllNotes`, `watchNoteById`) are unused  
- Schema migrations via Drift's `MigrationStrategy` are bypassed  
- Drift-level unit tests cannot be written until the repository is re-wired  
- The architecture review's stated goal ("uses Drift rather than only direct
  SQLite execution") is not yet satisfied in the running app

**Resolution** (after Issue 2 is resolved):
1. Generate `drift_database.g.dart`.
2. Update `note_repository_impl.dart` to inject and use `ColorOsNotesDatabase`.
3. Delete or archive `app_database.dart` once migration is verified.
4. Re-run `flutter test` to confirm all note lifecycle tests still pass.

---

## Issue 4 — `pubspec.lock` Absent [MEDIUM]

**Severity**: MEDIUM  
**Status**: UNRESOLVED — blocked by Issue 1

**Description**  
`flutter pub get` has never been executed. No `pubspec.lock` file exists in
`app/`. Declared dependency versions in `pubspec.yaml` are therefore
unresolved; the exact resolved versions are unknown.

**Impact**  
- Reproducible builds are not possible until `pubspec.lock` is committed  
- Transitive dependency conflicts (if any) are not yet detected  
- CI/CD pipelines that rely on a locked dependency graph will fail

**Key declared dependencies** (from `pubspec.yaml`):
```
flutter_inappwebview: ^6.1.5
drift: ^2.15.0
drift_flutter: ^0.2.0
sqlite3_flutter_libs: ^0.5.0
build_runner: ^2.4.0
drift_dev: ^2.15.0
supabase_flutter: ^2.3.0
record: ^5.1.0
```

**Resolution**  
```bash
cd /home/akash/Projects/Notes/app
flutter pub get
git add pubspec.lock
git commit -m "chore: add pubspec.lock after first flutter pub get"
```

---

## Issue 5 — Linux Wayland Compositing Flag Not Embedded in Launcher [MEDIUM]

**Severity**: MEDIUM  
**Status**: DOCUMENTED — workaround known, not yet automated

**Description**  
WebKitGTK 4.1 running under a Wayland compositor (Hyprland on this host)
requires the environment variable `WEBKIT_FORCE_COMPOSITING_MODE=1` to render
WebView content correctly. Without it, the WebView surface is blank or
produces rendering artifacts.

This flag is not set in any generated Flutter Linux runner script or
`CMakeLists.txt` and is not injected by `flutter build linux`. A developer or
end-user running the app cold will encounter a blank editor.

**Impact**  
- Editor WebView is blank on Wayland without the flag  
- Affects: Arch Linux / Hyprland (confirmed), likely all Wayland-only compositors

**Workaround**  
```bash
export WEBKIT_FORCE_COMPOSITING_MODE=1
./build/linux/x64/release/bundle/notes_app
```

**Resolution** (Milestone 4 task):
- Add a `notes_app.sh` wrapper script that exports the flag and launches the binary.
- Or patch `linux/CMakeLists.txt` to inject it via `add_custom_target`.
- Document in `PLATFORM_BUILD_STATUS.md`.

---

## Issue 6 — Audio Recording Not Verified via Flutter Plugin [MEDIUM]

**Severity**: MEDIUM  
**Status**: PARTIALLY VERIFIED — FFmpeg encoding confirmed, plugin untested

**Description**  
The `Audio Recording Audit` (Phase 1, Step 3) confirmed that the original app
records audio in MP3 format using `libmp3lame`. The host system's FFmpeg
(v9.0) encodes MP3 successfully. However, the `record` Flutter plugin
(v5.1.0, declared in `pubspec.yaml`) has never been instantiated, and
microphone access via PipeWire/PulseAudio has not been tested from a Flutter
application.

**Impact**  
- MP3 recording via the Flutter plugin is UNVERIFIED  
- PipeWire → PulseAudio compat layer on this host is untested with Flutter  
- Android microphone permissions integration is untested

**Resolution** (Milestone 4 task):
1. After Flutter SDK is installed and Linux build succeeds, run the app on the
   Linux host with a microphone connected.
2. Test `Record().start()` and `Record().stop()` with `AudioEncoder.mp3`.
3. Verify the produced `.mp3` file is valid (FFmpeg probe).
4. Update `AUDIO_RECORDING_AUDIT.md` with plugin test results.

---

## Issue 7 — Android / Windows / macOS Remain Untested [MEDIUM]

**Severity**: MEDIUM  
**Status**: DOCUMENTED — explicitly deferred

**Description**  
Only Linux is the validated target platform (WebKit2GTK 4.1 library confirmed
present). Android, Windows, and macOS have not been compiled for, run, or
tested.

| Platform | SDK Present | Build Attempted | Runtime Tested |
|----------|-------------|-----------------|----------------|
| Linux    | WebKit2GTK ✓ | No (no Flutter SDK) | No |
| Android  | ADB not checked | No | No |
| Windows  | N/A (Linux host) | No | No |
| macOS    | N/A (Linux host) | No | No |

**Impact**  
- Cross-platform claims are currently unsupported by evidence  
- `PLATFORM_BUILD_STATUS.md` reflects this: Android/Windows/macOS marked UNTESTED

**Resolution** (Milestone 4 and later):
- Linux: First priority — build and run on this host after Flutter SDK install.
- Android: Requires Android SDK + connected device or emulator.
- Windows/macOS: Requires access to those platforms.

---

## Issue 8 — Drift Table for `folders` and `tags` Not Audited Against Original Schema [LOW]

**Severity**: LOW  
**Status**: UNRESOLVED — schema assumed, not extracted

**Description**  
The Drift schema in `tables.drift` includes `Folders` and `Tags` tables whose
DDL was inferred from the Java entity classes, not extracted directly from
`AppDatabase_Impl.java`'s `createAllTables()` method (which was only partially
audited for `rich_notes` and `attachments`).

**Impact**  
- Minor risk of column count or type mismatch for `folders` and `tags`
- No data loss risk for Milestone 3 (tables are empty; no migration needed yet)

**Resolution** (Low priority — can be deferred to Milestone 4):
1. Extract and audit `folders` and `tags` DDL from `AppDatabase_Impl.java`.
2. Compare against `tables.drift` definitions.
3. Apply corrections if needed and commit.

---

## Issue 9 — No `.gitignore` Entry for `drift_database.g.dart` [LOW]

**Severity**: LOW  
**Status**: OPEN

**Description**  
Generated Dart files (`*.g.dart`) from `build_runner` are typically either
committed (for reproducibility) or gitignored (to avoid noise). The project
has not yet decided which policy to follow. Currently `.gitignore` has no
entry for `*.g.dart`.

**Recommendation**: Commit `drift_database.g.dart` once generated, since it is
required for compilation and Dart-level tests. Do not gitignore it.

---

## Resolution Priority Order

| # | Issue | Severity | Blocker For |
|---|-------|----------|-------------|
| 1 | Flutter SDK not installed | CRITICAL | Everything |
| 2 | `drift_database.g.dart` missing | HIGH | Drift ORM, repo layer |
| 3 | `note_repository_impl.dart` uses legacy sqlite3 | HIGH | Architecture correctness |
| 4 | `pubspec.lock` absent | MEDIUM | Reproducible builds |
| 5 | Wayland compositing flag | MEDIUM | Linux runtime |
| 6 | Audio plugin not tested | MEDIUM | Audio feature |
| 7 | Android/Windows/macOS untested | MEDIUM | Cross-platform claims |
| 8 | `folders`/`tags` schema not audited | LOW | Schema accuracy |
| 9 | `*.g.dart` gitignore policy | LOW | Developer workflow |

---

*Generated by Milestone 3.1 verification pass. All issues to be tracked until
resolved or explicitly deferred with written justification.*
