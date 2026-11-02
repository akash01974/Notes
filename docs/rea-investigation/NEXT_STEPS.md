# NEXT STEPS — ColorOS Notes Replacement: Engineering Roadmap

> **Document Status**: Final · Based on verified static analysis and reverse engineering findings  
> **Last Updated**: 2026-11-02  
> **Confidence Level**: High (editor layer), Medium (native attachment features), Low (cloud sync internals)

## Investigation Status Correction

The framework-specific proposal and broad portability claims in the pre-existing roadmap are not conclusions of this investigation. No framework is selected or recommended here. The editor bundle's complete bridge contracts are not yet fully mapped, and REA reports partial/truncated semantic coverage. Use the evidence-based priorities below; treat later framework-specific material as an unapproved historical sketch, not a decision or implementation instruction.

**Update 2026-11-02 — priority item 1 COMPLETE.** The unchanged production bundle now runs standalone in headless Chromium 156 (`helium-browser` + CDP, zero installs): **15/15 tests PASS** — startup, Vue/TipTap mount, blank-note init, typing, title (`onTitleChange`), bold/italic, headings (`multi-heading` + slash-menu bridge request), lists, table insert/cell-edit/add-row, undo/redo, JSON persistence, HTML/text extraction, reload+restore. Evidence, boot sequence and root-cause findings: `docs/rea-investigation/SMOKE_TEST_RESULTS.md`; harness: `apk-work/standalone-smoke-test/` (`node run_smoke.mjs`). Known gaps: **native slash-menu rendering still untested** (only the `showRichTextFormatMenu` bridge request was verified — the menu UI is native), and **two OPPO TBL-WebView-only `Selection.showHandles` console errors** are documented as native-required (caught by the bridge; style application still succeeds). The next engineering milestone is priority item 2 (bridge contract completion).

## Evidence-Based Priority Order

1. ~~**Standalone browser smoke test**~~ — ✅ **COMPLETE 2026-11-02 (15/15 PASS)**. Serve the unchanged bundle over local HTTP with a separate host shim injected before `index.js`. Confirmed: startup, attachment of the editor, blank-note initialization, text edits, formatting, content JSON updates, HTML/text extraction, and console errors (2 documented OPPO-specific `Selection.showHandles` errors; 0 network failures; native slash-menu rendering untested). Production bundle not edited. See `SMOKE_TEST_RESULTS.md`.
2. **Bridge contract completion**: Validate all 188 Android-to-JS registrations and 107 `@JavascriptInterface` signatures against actual call sites, payload construction, callbacks, and host implementations. Separate active calls from exposed-but-unreferenced methods.
3. **Content round-trip specification**: Capture representative `TiptapContentInfo`, TipTap JSON, HTML, and attachment outputs. Test legacy HTML migration and title/body serialization independently.
4. **Attachment and paint pipelines**: Trace Android file/URI lifecycle, audio playback/recording, contact/calendar actions, image preprocessing, paint binary/protobuf storage, and undo integration. Define platform adapter boundaries before choosing host technology.
5. **Dependency inventory completion**: Trace manifest permissions, intents, account/cloud SDK calls, dynamic URL-card network requests, and native library entry points. Confirm which are needed for editor-only operation versus the full Notes application.
6. **Cross-platform architecture decision**: Make a framework and storage/backend decision only after the user approves a platform strategy and the browser proof-of-concept establishes which editor assets can be reused.

**Do not proceed to a framework scaffold yet.** Priority item 1 (browser proof) is done; the next engineering milestone is item 2, bridge contract completion, followed by item 3, the content round-trip specification.

---

## 1. Executive Summary

The earlier executive summary below is preserved as historical context but was too confident. The current evidence-based status is:

- The bundle contains Vue/TipTap/ProseMirror and is structurally browser-based; standalone execution is now **verified** (15/15 PASS in headless Chromium, 2026-11-02), and the original bridge/native host is still required for several features (slash-menu UI, selection handles, skin/font assets, IME).
- Static extraction identified 188 Android→JS handler registrations and 107 Android `@JavascriptInterface` methods. Handler names are cataloged, but payload/callback contracts and native call-site coverage are incomplete.
- The native content model carries TipTap JSON alongside legacy HTML and attachment metadata. Round-trip compatibility and migration behavior need targeted tests before claiming schema portability.
- REA coverage is partial and the semantic graph is truncated; dynamic calls and ambiguous relations remain unresolved.

**What this means:**

A faithful cross-platform replacement remains the project objective. Reuse of the existing editor bundle and the scope of host adapters must be validated before an implementation strategy is selected.

**Confidence by layer:**

| Layer | Confidence | Basis |
|---|---|---|
| Editor (TipTap JS bundle) | ✅ High | Source inspected; standalone browser execution verified 15/15 PASS (2026-11-02) |
| Bridge protocol (WVJB) | Medium | Counts and names verified; many contracts/call sites remain unknown |
| Content data model | Medium | TipTap JSON, legacy HTML, and attachment fields observed; round-trip untested |
| Local database schema | ✅ High | Room v47 schema extracted, key fields verified |
| Attachment handling | 🟡 Medium | Table structure known, binary blobs not fully traced |
| Cloud sync internals | 🔴 Low | OPLUS HeyTap — proprietary, must be replaced entirely |
| Paint canvas (native) | 🔴 Low | Uses native Android canvas, needs full web reimplementation |

---

## 2. Legacy Example Only (Not a Framework Recommendation): Validate Standalone Editor

The following older examples mention framework-specific or implementation-specific choices. They are retained for context only and are not an approved stack selection. The immediate framework-neutral milestone and acceptance criteria are in **Evidence-Based Priority Order** above.

**Timeline**: 1–2 days  
**Goal**: Confirm the extracted TipTap editor bundle runs correctly in a browser without any Android or OPPO infrastructure.

### Prerequisites

- Extracted editor bundle at `assets/tiptap/` (already obtained during investigation)
- A local HTTP server (Python `http.server`, `npx serve`, or Vite dev server)
- Chromium or Firefox (DevTools required)

### Tasks

#### 2.1 Create `mock_bridge.js`

Create a JavaScript mock of the WVJB bridge that intercepts all `injectedObject.*` calls and `registerHandler` registrations. Minimum viable mock:

```js
// mock_bridge.js — inject before the editor bundle loads
window.injectedObject = {
  // Content lifecycle
  onContentJsonUpdate: (json) => {
    console.log('[MOCK] onContentJsonUpdate', JSON.parse(json));
    localStorage.setItem('note_content', json);
  },
  onTitleJsonUpdate: (json) => console.log('[MOCK] onTitleJsonUpdate', json),

  // Editor state
  notifyEditorLoaded: () => console.log('[MOCK] Editor ready'),
  notifyEditorFocused: () => {},
  notifyEditorBlurred: () => {},

  // Formatting state reporting
  onFormatStateChange: (json) => console.log('[MOCK] formatState', json),
  onSelectionChange: (json) => console.log('[MOCK] selection', json),

  // Undo/redo state
  onUndoStateChange: (canUndo, canRedo) => {},

  // Stub all remaining 100 methods
  ...new Proxy({}, {
    get: (_, prop) => (...args) => console.log(`[MOCK] injectedObject.${prop}(`, ...args, ')')
  })
};

// WVJB handler registry — capture all 188 handlers
window._bridgeHandlers = {};
window.WebViewJavascriptBridge = {
  registerHandler: (name, fn) => { window._bridgeHandlers[name] = fn; },
  callHandler: (name, data, cb) => console.log(`[MOCK] callHandler: ${name}`, data),
};

// Helper: simulate callInitContentFromJava from native side
window.mockInitContent = (overrides = {}) => {
  const defaultContent = {
    guid: 'mock-guid-0001',
    titleHintText: 'Title',
    title: '',
    content: '',
    subAttachments: [],
    pageResults: [],
    pictureAttrs: {},
    tiptapTitleJson: null,
    tiptapContentJson: null,
    isDoingSummary: false,
    ...overrides
  };
  if (window._bridgeHandlers['callInitContentFromJava']) {
    window._bridgeHandlers['callInitContentFromJava'](JSON.stringify(defaultContent), () => {});
  }
};

// Auto-init after a short delay
setTimeout(() => window.mockInitContent(), 300);
```

#### 2.2 Inject Mock into `index.html`

Add the script tag **before** the editor bundle `<script>` tag:

```html
<script src="mock_bridge.js"></script>
<!-- existing editor bundle scripts below -->
```

#### 2.3 Serve and Verify

```bash
cd assets/tiptap/
python3 -m http.server 8080
# Navigate to http://localhost:8080 in Chromium
```

### Success Criteria

- [ ] Editor renders without JavaScript errors in DevTools console
- [ ] Typing text in the editor body works
- [ ] Toolbar formatting (Bold, Italic, Underline, Strikethrough) applies correctly
- [ ] Heading levels (H1, H2, H3) work
- [ ] Bullet and numbered lists work
- [ ] `onContentJsonUpdate` fires on every edit (verify in console)
- [ ] `localStorage.getItem('note_content')` returns valid ProseMirror JSON after editing
- [ ] Calling `window._bridgeHandlers['callGetAllHTMLFromJava'](null, cb)` returns HTML string
- [ ] Re-loading the page and calling `window.mockInitContent({ tiptapContentJson: ... })` restores note content
- [ ] Tables, code blocks, and blockquotes render correctly

### Notes

- If the editor fails to init, check `window._bridgeHandlers` in the console — all handlers must be registered before `mockInitContent()` fires.
- The `Ma()` function in the bundle is the legacy HTML→TipTap JSON converter; it can be called via the bridge to test migration.

---

## 3. Milestone 1: Flutter App Shell with WebView

**Timeline**: 1–2 weeks  
**Goal**: A Flutter Android app that loads the TipTap editor in a WebView and correctly exchanges messages via a reimplemented bridge layer.

### 3.1 Flutter Project Setup

```bash
flutter create \
  --org dev.notes \
  --project-name coloros_notes \
  --platforms android,ios,linux,windows,macos,web \
  /home/akash/Projects/Notes/coloros-notes-flutter/
```

Add dependencies to `pubspec.yaml`:

```yaml
dependencies:
  flutter_inappwebview: ^6.0.0   # preferred — full WVJB-compatible JS channel
  sqflite: ^2.3.0                # local SQLite
  path_provider: ^2.1.0
  uuid: ^4.3.0
  riverpod: ^2.5.0               # state management
  go_router: ^13.0.0             # navigation
```

### 3.2 Editor Asset Bundling

Copy the extracted editor bundle into the Flutter assets directory:

```
coloros-notes-flutter/
  assets/
    editor/
      index.html
      mock_bridge.js      ← replaced by flutter_bridge.js in production
      (all tiptap bundle files)
```

Register in `pubspec.yaml`:

```yaml
flutter:
  assets:
    - assets/editor/
```

### 3.3 Bridge Adapter Architecture

The bridge adapter translates between the Flutter platform channel and the WVJB message format used by the editor.

```
┌─────────────────────────────────┐
│         TipTap Editor           │
│   (running in InAppWebView)     │
│                                 │
│  injectedObject.*  ←→  WVJB    │
└───────────┬─────────────────────┘
            │  JavaScript Channel
            │  (evaluateJavascript / addJavaScriptHandler)
┌───────────▼─────────────────────┐
│      FlutterBridgeAdapter       │
│   (Dart — lib/bridge/)          │
│                                 │
│  NativeToJS: callHandler()      │
│  JSToNative: @JSInterface       │
└───────────┬─────────────────────┘
            │  Dart method calls
┌───────────▼─────────────────────┐
│      NoteRepository             │
│   (SQLite / Supabase)           │
└─────────────────────────────────┘
```

Create `lib/bridge/flutter_bridge_adapter.dart`:

```dart
class FlutterBridgeAdapter {
  final InAppWebViewController webViewController;
  final NoteRepository noteRepository;

  FlutterBridgeAdapter({required this.webViewController, required this.noteRepository});

  // Called by Flutter to send a command to the editor
  Future<void> callEditorHandler(String handlerName, dynamic data) async {
    final payload = jsonEncode({'handlerName': handlerName, 'data': data});
    await webViewController.evaluateJavascript(
      source: "window._bridgeHandlers['$handlerName'](${jsonEncode(data)}, function(){});",
    );
  }

  // Called when the editor calls injectedObject.*
  void onJSMessage(String method, dynamic args) {
    switch (method) {
      case 'onContentJsonUpdate':
        noteRepository.autoSave(args as String);
        break;
      case 'onTitleJsonUpdate':
        noteRepository.autoSaveTitle(args as String);
        break;
      case 'notifyEditorLoaded':
        _initEditor();
        break;
      // ... all 107 handlers
    }
  }

  Future<void> _initEditor() async {
    final note = await noteRepository.getCurrentNote();
    await callEditorHandler('callInitContentFromJava', note.toTiptapInitJson());
  }
}
```

### 3.4 Critical Bridge Handlers (Priority 1 — Must Implement)

These 20 handlers cover the core editing experience:

| Direction | Handler | Description |
|---|---|---|
| Native→JS | `callInitContentFromJava` | Load note content on editor open |
| Native→JS | `callGetAllHTMLFromJava` | Export note as HTML |
| Native→JS | `callSetReadOnlyFromJava` | Toggle read-only mode |
| Native→JS | `callUndoFromJava` | Trigger undo |
| Native→JS | `callRedoFromJava` | Trigger redo |
| Native→JS | `callSetBoldFromJava` | Toggle bold |
| Native→JS | `callSetItalicFromJava` | Toggle italic |
| Native→JS | `callSetUnderlineFromJava` | Toggle underline |
| Native→JS | `callSetHeadingFromJava` | Set heading level |
| Native→JS | `callSetBulletListFromJava` | Toggle bullet list |
| Native→JS | `callSetOrderedListFromJava` | Toggle numbered list |
| Native→JS | `callInsertImageFromJava` | Insert image by URI |
| Native→JS | `callFocusEditorFromJava` | Focus editor |
| Native→JS | `callBlurEditorFromJava` | Blur/dismiss keyboard |
| JS→Native | `onContentJsonUpdate` | Receive updated content JSON |
| JS→Native | `onTitleJsonUpdate` | Receive updated title JSON |
| JS→Native | `notifyEditorLoaded` | Editor ready — trigger `callInitContentFromJava` |
| JS→Native | `onFormatStateChange` | Sync toolbar formatting state |
| JS→Native | `onUndoStateChange` | Enable/disable undo/redo toolbar buttons |
| JS→Native | `callGetAttachmentsFromJava` | Fetch attachments list for current note |

### 3.5 Target State for Milestone 1

- [ ] Flutter app builds and runs on Android
- [ ] Editor loads from local assets — no network required
- [ ] Typing and basic formatting works end-to-end
- [ ] Note content persists to SQLite on every edit (auto-save via `onContentJsonUpdate`)
- [ ] Title persists to SQLite
- [ ] Reopening the editor restores previous note content via `callInitContentFromJava`
- [ ] Undo/redo functional
- [ ] Toolbar state (bold/italic/etc.) reflects cursor position

---

## 4. Milestone 2: Local Note Storage

**Timeline**: 1–2 weeks  
**Goal**: Full note CRUD, folder organization, and a functional note list screen backed by SQLite.

### 4.1 SQLite Schema (Compatible with Original ColorOS Schema)

Design the local schema to be structurally compatible with the original Room v47 `text_note` table to facilitate import later:

```sql
CREATE TABLE notes (
  _id           INTEGER PRIMARY KEY AUTOINCREMENT,
  guid          TEXT    NOT NULL UNIQUE,   -- UUID v4, canonical identifier
  title         TEXT    NOT NULL DEFAULT '',
  content       TEXT    NOT NULL DEFAULT '', -- legacy HTML (preserved for migration compat)
  tiptap_content_json TEXT,               -- ProseMirror JSON (canonical)
  tiptap_title_json   TEXT,               -- ProseMirror JSON for title
  folder_id     INTEGER REFERENCES folders(_id) ON DELETE SET NULL,
  create_time   INTEGER NOT NULL,         -- Unix ms
  last_modify_time INTEGER NOT NULL,      -- Unix ms
  is_deleted    INTEGER NOT NULL DEFAULT 0,
  is_favorite   INTEGER NOT NULL DEFAULT 0,
  remind_time   INTEGER,                  -- Unix ms, nullable
  sync_version  INTEGER NOT NULL DEFAULT 0, -- for delta sync
  sync_status   TEXT    NOT NULL DEFAULT 'local' -- 'local'|'synced'|'conflict'
);

CREATE TABLE folders (
  _id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  create_time   INTEGER NOT NULL,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  is_deleted    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE attachments (
  _id           INTEGER PRIMARY KEY AUTOINCREMENT,
  note_guid     TEXT NOT NULL REFERENCES notes(guid) ON DELETE CASCADE,
  type          TEXT NOT NULL,  -- 'image'|'audio'|'file'|'paint'
  local_path    TEXT,
  remote_url    TEXT,
  mime_type     TEXT,
  file_size     INTEGER,
  create_time   INTEGER NOT NULL
);

CREATE INDEX idx_notes_folder ON notes(folder_id);
CREATE INDEX idx_notes_modified ON notes(last_modify_time DESC);
CREATE INDEX idx_notes_deleted ON notes(is_deleted);
CREATE INDEX idx_attachments_note ON attachments(note_guid);
```

### 4.2 Auto-Save Flow

```
Editor types → onContentJsonUpdate(json) → FlutterBridgeAdapter
  → NoteRepository.autoSave(noteGuid, json)
    → Debounce 800ms
    → UPDATE notes SET tiptap_content_json=?, last_modify_time=?, sync_status='local' WHERE guid=?
    → Notify NoteListScreen via Riverpod stream
```

### 4.3 Note List Screen

- Display notes sorted by `last_modify_time DESC`
- Show title + first 100 chars of plain text (extract from TipTap JSON)
- Swipe-to-delete (soft delete: `is_deleted=1`)
- Folder sidebar / bottom sheet
- FAB to create new note (insert row, open editor)
- Search (SQLite `LIKE` on title + content fields — full-text search via FTS5 extension optional)

### 4.4 Folder Organization

- Folders CRUD (create, rename, delete, reorder)
- Move note to folder
- "All Notes", "Favorites", "Trash" smart folders (filter views)
- Recover from Trash / permanent delete

---

## 5. Milestone 3: Cloud Synchronization

**Timeline**: 2–3 weeks  
**Goal**: Offline-first sync to Supabase with conflict resolution.

### 5.1 Supabase Setup

**Project**: Create at [supabase.com](https://supabase.com)

**Tables** (mirror local SQLite schema with additions):

```sql
-- In Supabase (PostgreSQL)
CREATE TABLE notes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  guid          TEXT NOT NULL,
  title         TEXT NOT NULL DEFAULT '',
  tiptap_content_json JSONB,
  tiptap_title_json   JSONB,
  folder_id     UUID REFERENCES folders(id),
  create_time   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_modify_time TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_deleted    BOOLEAN NOT NULL DEFAULT false,
  is_favorite   BOOLEAN NOT NULL DEFAULT false,
  remind_time   TIMESTAMPTZ,
  version       INTEGER NOT NULL DEFAULT 1,
  UNIQUE(user_id, guid)
);

-- Row-Level Security
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own notes" ON notes
  FOR ALL USING (auth.uid() = user_id);
```

Enable Supabase Realtime on the `notes` table for live sync across devices.

### 5.2 Offline-First Delta Sync Strategy

```
Local write → mark sync_status='local', increment sync_version
  ↓ (background sync worker, runs every 30s or on connectivity change)
Push: SELECT * FROM notes WHERE sync_status='local'
  → Upsert to Supabase (ON CONFLICT (user_id, guid) DO UPDATE)
  → If server version > local version → CONFLICT
Pull: SELECT * FROM supabase WHERE version > last_pull_version
  → Merge into local SQLite
  → If local is also 'local' → CONFLICT
```

### 5.3 Conflict Resolution Strategy

**Policy**: Last-write-wins at the field level for metadata; content uses a merge strategy.

| Field | Strategy |
|---|---|
| `title` | Last-write-wins (timestamp) |
| `tiptap_content_json` | Last-write-wins (timestamp); surface conflict badge in UI |
| `is_deleted` | Delete wins — if either side deleted, mark deleted |
| `is_favorite` | Last-write-wins |
| `folder_id` | Last-write-wins |

Future: ProseMirror collaborative editing (Y.js / Automerge CRDT) can be added for true merge of content edits.

### 5.4 Authentication

- Email + magic link (Supabase Auth built-in)
- Google OAuth (Supabase Auth provider)
- Anonymous (local-only mode, upgrade to account later)
- Session stored in `flutter_secure_storage`

### 5.5 Attachment Sync

- Images/audio/files uploaded to Supabase Storage (`notes/{user_id}/{note_guid}/{filename}`)
- Local path cached in `attachments.local_path`
- Remote URL stored in `attachments.remote_url`
- Download on demand (not eagerly) to preserve storage on mobile

---

## 6. Milestone 4: Desktop Support

**Timeline**: 1–2 weeks  
**Goal**: Run the same Flutter app on Linux (Hyprland), Windows, and macOS.

### 6.1 Flutter Desktop (Recommended)

Flutter Desktop is the path of least resistance — it reuses all existing Dart/Flutter code.

```bash
flutter run -d linux
flutter run -d windows
flutter run -d macos
```

**WebView on Desktop**: Use `flutter_inappwebview` (supported on Linux/Windows/macOS via `webview_flutter_linux`, Chromium/WebKit backends).

**Known issues to resolve:**

| Platform | Issue | Mitigation |
|---|---|---|
| Linux | `webview_flutter_linux` uses `webkit2gtk` — may have rendering differences | Test on target Hyprland/GTK stack |
| Windows | CEF or Edge WebView2 backend | Use `flutter_inappwebview` which wraps Edge WebView2 |
| macOS | WKWebView (Safari engine) — check for JS compatibility | Test all editor features |

### 6.2 Desktop-Specific UX

- **Keyboard shortcuts**: Ctrl+Z/Y (undo/redo), Ctrl+B/I/U (formatting), Ctrl+N (new note), Ctrl+S (force save) — map to bridge handler calls
- **Window chrome**: Title bar shows note title; minimize to system tray (Linux: `system_tray` package)
- **Resizable sidebar**: Note list as left panel; editor fills right
- **Context menus**: Right-click in editor for formatting menu (pass through to TipTap context menu)
- **Drag and drop**: Files dragged onto editor → insert as attachment

### 6.3 Alternative: Tauri Shell

If Flutter Desktop WebView has issues, Tauri provides a native OS WebView (WebKit on Linux/macOS, Edge on Windows) with a Rust backend.

- Rust bridge replaces the Flutter Dart bridge
- Communication via Tauri `invoke` API (replaces `JavascriptChannel`)
- SQLite via `tauri-plugin-sql`
- Smaller binary than Flutter Desktop

**Trade-off**: Tauri is a divergence from the Flutter codebase. Prefer Flutter Desktop unless severe rendering issues are encountered.

---

## 7. Milestone 5: Advanced Features

**Timeline**: Ongoing  
**Goal**: Feature parity with ColorOS Notes for power users.

### 7.1 Audio Recording

- **Web side**: The editor's Record extension uses `navigator.mediaDevices.getUserMedia` + `MediaRecorder` API — these are standard web APIs and work in modern WebViews.
- **Flutter side**: Bridge handler `callStartRecordingFromJava` must grant microphone permission via `permission_handler` package, then signal the editor to begin recording.
- **Storage**: Audio blobs passed back via `onAudioAttachmentSaved(base64, mimeType)` → write to local file → upload to Supabase Storage.

### 7.2 Paint / Drawing Canvas

The original Paint block uses native Android Canvas — this is **not portable** and must be fully reimplemented.

**Recommended approach**: Replace with a web-based canvas inside the TipTap editor.

Implementation options (in preference order):

| Option | Pros | Cons |
|---|---|---|
| **Fabric.js** embedded in a TipTap custom node | Feature-rich, well-maintained | Requires editor modification |
| **Konva.js** embedded in a TipTap custom node | Good performance, React/Vue bindings | Heavier bundle |
| **Flutter `CustomPaint`** in a platform view | Native feel on mobile | Not usable inside WebView |
| **`<canvas>` with pointer events** custom | Lightweight, no dependency | More code to write |

The TipTap editor already has a `Paint` extension node — the node renders a placeholder; the actual drawing happens natively. We need to replace this native renderer with a JS canvas renderer. The `callPaintResultFromJava` bridge handler delivers the paint result (likely a base64 PNG) — we can keep this interface and replace the Android paint activity with a Flutter `CustomPainter` or a JS canvas sheet.

### 7.3 Contact Cards

- Android: Read from `content://contacts` via `contacts_service` Flutter package; display as TipTap node
- Desktop/Web: Import from VCF file or manual entry
- Bridge: `callContactAttachFromJava` delivers contact JSON to editor

### 7.4 Schedule / Reminder Cards

- Local: `flutter_local_notifications` for reminder notifications
- Integration: Calendar via `add_2_calendar` or `device_calendar` Flutter packages
- Bridge: `callScheduleAttachFromJava` delivers schedule JSON

### 7.5 AI Features (Gemini API)

Replace OPPO AIGC with Gemini API:

- **Summarize**: Send `tiptap_content_json` as plain text to Gemini, display summary
- **Continue writing**: Send selection context, Gemini continues
- **Smart tags**: Auto-label notes by topic
- **Search by meaning**: Embed notes with `text-embedding-004`, store in pgvector (Supabase extension), semantic search

Bridge handler: `callAIGCFromJava` triggers AI processing; result delivered via `callAIGCResultFromJava`.

---

## 8. Milestone 6: Data Migration (Optional)

**Timeline**: 3–5 days (if needed)  
**Goal**: Import existing notes from a user's ColorOS Notes database.

### 8.1 SQLite Import

The original database file is at (on a rooted device or via ADB backup):
```
/data/data/com.oplus.note/databases/note.db
```

The `text_note` table fields map directly to our schema. Import procedure:

```dart
Future<void> importColorOsNotes(String sourceDbPath) async {
  final sourceDb = await openDatabase(sourceDbPath, readOnly: true);
  final notes = await sourceDb.query('text_note',
    where: 'is_deleted = 0',
    columns: ['guid', 'title', 'content', 'tiptap_content_json',
               'tiptap_title_json', 'folder_id', 'create_time',
               'last_modify_time', 'is_favorite', 'remind_time']);

  for (final row in notes) {
    // If tiptap_content_json is null, convert from legacy HTML
    final contentJson = row['tiptap_content_json'] ??
        await convertHtmlToTiptap(row['content'] as String);
    await localDb.insert('notes', {...row, 'tiptap_content_json': contentJson},
      conflictAlgorithm: ConflictAlgorithm.ignore);
  }
}
```

### 8.2 Legacy HTML → TipTap JSON Conversion

The editor bundle contains the function `Ma()` which converts legacy HTML to TipTap JSON. This can be invoked via the bridge:

```js
// In mock_bridge.js or flutter_bridge.js
window.convertLegacyHtml = (html) => {
  return JSON.stringify(Ma(html)); // Ma() is the internal converter
};
```

Call from Flutter:
```dart
final tiptapJson = await webViewController.evaluateJavascript(
  source: "window.convertLegacyHtml(${jsonEncode(legacyHtml)})"
);
```

### 8.3 Attachment Migration

- Images stored in `/data/data/com.oplus.note/files/` — copy to app storage
- Audio recordings — copy to app storage
- Update `attachments` table with new local paths

---

## 9. Risk Register

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | WebView JS engine differences (Safari/WebKit vs V8/Blink) cause editor bugs on iOS/macOS | Medium | High | Test on each platform in Milestone 1; fix via polyfills or CSS overrides |
| R2 | `flutter_inappwebview` WebView on Linux (`webkit2gtk`) has rendering issues | Medium | High | Fallback to Tauri on Linux; maintain both shells |
| R3 | Editor bundle updates (OPPO OTA) break the bridge protocol | Low | Medium | Pin editor bundle version; decouple editor upgrade from bridge upgrade |
| R4 | ProseMirror content JSON schema changes between TipTap versions | Low | High | Store raw JSON with schema version tag; write migration functions |
| R5 | Paint canvas web reimplementation lags significantly behind native | High | Medium | Ship without paint initially; add in Milestone 5 as optional feature |
| R6 | Supabase free tier limits (500MB DB, 1GB storage) hit by power users | Medium | Low | Self-hostable Supabase (Docker); or Appwrite as fallback |
| R7 | Microphone/camera permissions behave differently across desktop OSes | Medium | Medium | Test on Linux/Wayland — `libpulse`/`pipewire` for audio capture |
| R8 | Legacy HTML→TipTap JSON converter (`Ma()`) is not accessible via public API | Low | Medium | Extract and test `Ma()` in Milestone 0; rewrite in Dart if needed |
| R9 | SQLite concurrent write contention during auto-save + sync | Medium | Medium | Single-writer pattern; use WAL journal mode; serialize writes via queue |
| R10 | OPPO cloud database not exportable without root access for migration | High | Low | Offer manual import via ADB backup; document procedure; this is optional |

---

## 10. Architecture Decision Records

### ADR-001: Reuse Existing TipTap Editor Bundle

**Decision**: Use the extracted `assets/tiptap/` bundle directly, without modification.  
**Rationale**: The bundle is standard web technology, no proprietary code, and reimplementing it would take months. Reuse saves the majority of editor development effort.  
**Trade-offs**: We are coupled to the current editor version; OPPO may update it in future OTAs.  
**Status**: ACCEPTED

### ADR-002: Flutter as Cross-Platform Shell

**Decision**: Flutter for Android, iOS, Linux, Windows, macOS, and Web.  
**Rationale**: Single codebase, native performance, good WebView support via `flutter_inappwebview`, strong community.  
**Alternatives considered**: React Native (poor WebView story), Tauri (Rust learning curve, no mobile), Electron (heavy).  
**Status**: ACCEPTED

### ADR-003: TipTap JSON as Canonical Content Format

**Decision**: `tiptap_content_json` (ProseMirror document JSON) is the source of truth; HTML is legacy-only.  
**Rationale**: ProseMirror JSON is structured, diffable, and transformable. HTML is lossy and harder to sync.  
**Trade-offs**: Must maintain `Ma()` converter for legacy note import.  
**Status**: ACCEPTED

### ADR-004: Supabase for Cloud Backend

**Decision**: Supabase (PostgreSQL + Realtime + Storage + Auth).  
**Rationale**: Open source, self-hostable, strong Flutter SDK, pgvector for AI features. Avoids vendor lock-in.  
**Alternatives considered**: Firebase (proprietary, no SQL), Appwrite (less mature), custom backend (too much scope).  
**Status**: ACCEPTED

### ADR-005: Offline-First with Delta Sync

**Decision**: SQLite is the primary store; Supabase is the sync target. App is fully functional without network.  
**Rationale**: Notes app must work offline. Sync is secondary. This matches the original ColorOS behavior.  
**Status**: ACCEPTED

### ADR-006: Paint Canvas — Deferred

**Decision**: Native Android paint is not reimplemented until Milestone 5. Notes with paint blocks display a static image placeholder.  
**Rationale**: Paint is a complex feature. Core note functionality must ship first.  
**Status**: ACCEPTED (deferred)

---

## 11. Open Questions

These items require further investigation before the relevant milestones can proceed:

1. **`callPaintResultFromJava` payload format**: Does the paint result arrive as a base64 PNG, a file URI, or a binary blob? This determines the web canvas → Flutter handoff design.

2. **Audio encoding format**: What codec/container does the Record extension produce? Is it WebM/Opus (web standard) or does the original app transcode on the native side?

3. **`subAttachments` and `pageResults` in `TiptapContentInfo`**: These fields are present in `callInitContentFromJava`. Their exact JSON structure is not fully documented. What do they contain?

4. **Editor bundle update mechanism**: Does OPPO ship editor bundle updates with the APK or via a separate CDN? If CDN, can we intercept them?

5. **Table/image resize handlers**: The editor has drag-to-resize for tables and images. Do these depend on any native bridge calls or are they fully in-browser?

6. **Encryption at rest**: Does ColorOS Notes encrypt the SQLite database? If so, with what key derivation (device key, user password)?

7. **WVJB message framing**: Is the WVJB used here the standard WebViewJavascriptBridge library (GitHub: marcuswestin/WebViewJavascriptBridge) or a custom OPLUS variant? The handshake sequence should be confirmed before reimplementing.

8. **Desktop file picker integration**: On Linux/Wayland, file picker dialogs require `xdg-portal`. Does `flutter_inappwebview`'s `<input type=file>` handling work through the portal?

9. **Folder color/icon metadata**: The original app shows colored folders with icons. Are these stored in the `folders` table or inferred from folder name?

10. **Multi-account support**: Does the original app support multiple accounts? Should our implementation support it from day one?

---

*End of NEXT_STEPS.md*
