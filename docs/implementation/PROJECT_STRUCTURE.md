# Project Structure & Architecture Layout — ColorOS Notes Rebuild

| Field | Value |
|---|---|
| **Status** | SPECIFICATION DOCUMENT — Milestone 3 Deliverable |
| **Date** | 2026-11-02 |
| **Target Framework** | Flutter 3.x (Dart 3.3+) |
| **Architecture Pattern** | Clean Layered Architecture (Domain / Data / Presentation / Editor Host) |

---

## 1. Repository Directory Topology

```
/home/akash/Projects/Notes/
├── ColorOSNotes.apk                       [257.7 MB] Original ColorOS Notes APK v16.7.5
├── PROJECT_CONTEXT.md                    Authoritative baseline documentation
├── docs/                                  Consolidated technical research & specifications
│   ├── APK_ANALYSIS.md                    Static component and asset audit
│   ├── COMPATIBILITY_REPORT.md            Platform portability analysis
│   ├── UI_SCREEN_MAP.md                   COUI design tokens and layout inventory
│   ├── rea-investigation/                 Phase 1 Reverse Engineering Audits (12 documents)
│   ├── architecture/                      Milestone 2 & 2.5 Architecture & Feasibility Reports (9 documents)
│   └── implementation/                    Milestone 3 Implementation Documentation
│       ├── MILESTONE_3_PROGRESS.md        Current implementation progress report
│       ├── PROJECT_STRUCTURE.md           This document
│       ├── EDITOR_HOST_IMPLEMENTATION.md  Isolated WebView host & bridge architecture
│       ├── DATABASE_IMPLEMENTATION.md     Room v47 schema implementation & 49-column resolution
│       └── PLATFORM_BUILD_STATUS.md       Platform test status and limitations
├── apk-work/                              Raw extraction artifacts & decompiled sources
├── test_runner/                           Automated Test Suites (Python & Node.js)
│   ├── test_database.py                   SQLite Room v47 schema & cascade deletion suite
│   ├── test_bridge_protocol.js            WVJB message framing & TiptapContentInfo suite
│   ├── test_note_lifecycle.py             CRUD state transitions & auto-save suite
│   └── run_all_tests.sh                   Unified test execution script
└── app/                                   Flutter Cross-Platform Application Source
    ├── pubspec.yaml                       Dependency manifest & asset configuration
    ├── assets/
    │   └── tiptap/                        Unchanged production editor bundle assets
    │       ├── index.html                 Editor entrypoint
    │       ├── assets/                    TipTap/Vue/ProseMirror vendor bundles
    │       ├── icons/                     Editor toolbar icons
    │       └── lottie/                    Animation assets
    ├── lib/
    │   ├── main.dart                      Application entrypoint & dependency injection
    │   ├── core/                          Shared design tokens & theme configuration
    │   │   ├── coui_colors.dart           ColorOS UI color palette (signature green, neutrals)
    │   │   └── coui_theme.dart            ThemeData definitions for Light and Dark modes
    │   ├── domain/                        Pure Dart business logic & abstract contracts
    │   │   ├── entities/                  Data transfer objects & domain models
    │   │   │   ├── note.dart              NoteEntity (core note fields)
    │   │   │   ├── attachment.dart        AttachmentEntity (metadata & dimensions)
    │   │   │   └── folder.dart            FolderEntity (categorization)
    │   │   └── repositories/
    │   │       └── note_repository.dart   Abstract repository contract
    │   ├── data/                          Concrete data layer implementations
    │   │   ├── database/
    │   │   │   ├── schema_room_v47.dart   Exact Room v47 DDL strings (49 rich_notes columns)
    │   │   │   └── app_database.dart      SQLite3 engine manager with WAL mode & foreign keys
    │   │   └── repositories/
    │   │       └── note_repository_impl.dart Concrete NoteRepository with broadcast streams
    │   ├── editor_host/                   Isolated WebView container & bridge protocol
    │   │   ├── tiptap_content_info.dart   10-field content initialization model
    │   │   ├── editor_bridge_host.dart    WVJB bidirectional bridge dispatcher
    │   │   └── editor_view.dart           Flutter InAppWebView widget with injected host shims
    │   └── presentation/                  User interface screens & widgets
    │       ├── screens/
    │       │   ├── notes_list_screen.dart Note list, staggered grid, search, floating action button
    │       │   └── note_editor_screen.dart Editor screen with auto-save & COUI toolbar
    │       └── widgets/
    ├── android/                           Android native runner configuration
    ├── linux/                             Linux GTK native runner configuration
    ├── windows/                           Windows native runner configuration
    └── macos/                             macOS native runner configuration
```

---

## 2. Dependency Manifest Catalog (`pubspec.yaml`)

| Package | Version | Layer | Primary Role |
|---|:---:|---|---|
| **`flutter_inappwebview`** | `^6.1.5` | Editor Host | Cross-platform Chromium/WebKit webview container with native bridge promises |
| **`drift`** | `^2.20.0` | Data Layer | Type-safe persistence library with automated migration runner |
| **`drift_flutter`** | `^0.2.0` | Data Layer | Flutter bindings for Drift database file management |
| **`sqlite3`** | `^2.4.6` | Data Layer | Direct C-bindings to native SQLite3 library |
| **`sqlite3_flutter_libs`** | `^0.5.24` | Data Layer | Bundles precompiled SQLite3 C-binaries for Android, iOS, Windows, macOS, Linux |
| **`path_provider`** | `^2.1.4` | Core / Storage | Resolves platform-specific AppData, Cache, and Documents directories |
| **`path`** | `^1.9.0` | Core / Storage | Cross-platform POSIX and Windows filesystem path manipulation |
| **`uuid`** | `^4.5.1` | Domain | Cryptographically secure UUIDv4 generation for note and attachment IDs |
| **`crypto`** | `^3.0.5` | Storage / Sync | MD5 and SHA-256 calculation for attachment deduplication |
| **`record`** | `^5.1.2` | Media | Universal MP3/AAC audio recording with real-time decibel metering |
| **`audioplayers`** | `^6.0.0` | Media | Seekable audio playback with millisecond-accurate timeline event dispatch |

---

## 3. Layered Architectural Boundaries

```
┌────────────────────────────────────────────────────────┐
│                   PRESENTATION LAYER                   │
│   NotesListScreen, NoteEditorScreen, CouiToolbar       │
└──────────────────────────┬─────────────────────────────┘
                           │ Invokes User Actions
                           ▼
┌────────────────────────────────────────────────────────┐
│                      DOMAIN LAYER                      │
│   NoteEntity, AttachmentEntity, NoteRepository (I/F)   │
└──────────────────────────┬─────────────────────────────┘
                           │ Implements Abstract Contracts
                           ▼
┌────────────────────────────────────────────────────────┐
│                      DATA LAYER                        │
│   NoteRepositoryImpl, AppDatabase, SchemaRoomV47       │
└──────────────────────────┬─────────────────────────────┘
                           │ Reads / Writes
                           ▼
┌────────────────────────────────────────────────────────┐
│                  STORAGE / REPO LAYER                  │
│   SQLite3 (WAL Mode, Room v47 Schema) + Asset Store    │
└────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────┐
│                   EDITOR HOST LAYER                    │
│   EditorView, EditorBridgeHost, TiptapContentInfo       │
│   (Isolated Runtime communicating via WVJB Bridge)     │
└────────────────────────────────────────────────────────┘
```
