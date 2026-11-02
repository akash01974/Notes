# NEXT STEPS — ColorOS Notes Replacement: Engineering Roadmap

> **Document Status**: Final · Based on verified static analysis, bridge contract audit, and standalone browser verification  
> **Last Updated**: 2026-11-02  
> **Confidence Level**: High (editor layer, bridge protocol, local database schema, content round-trip), Medium (native attachment/paint pipelines), Low (proprietary HeyTap cloud sync)

## Investigation Status Correction

The framework-specific proposal and broad portability claims in the pre-existing roadmap are not conclusions of this investigation. No framework is selected or recommended here. The immediate investigation phase has systematically mapped the editor bundle, bridge contracts, content round-trip flows, and local storage schema. Use the evidence-based priorities below; treat later framework-specific material as an unapproved historical sketch, not a decision or implementation instruction.

**Update 2026-11-02 — Milestone Status:**
1. **Priority Item 1 (Standalone Browser Smoke Test)**: ✅ **COMPLETE (15/15 PASS)**. The unchanged production bundle runs in headless Chromium 156 (`helium-browser` + CDP, zero installs) with full startup, Vue/TipTap mount, blank-note init, typing, title (`onTitleChange`), bold/italic, headings (`multi-heading`), lists, table insert/cell-edit/add-row, undo/redo, JSON persistence, HTML/text extraction, reload+restore. Documented in `docs/rea-investigation/SMOKE_TEST_RESULTS.md`.
2. **Priority Item 2 (Bridge Contract Completion)**: ✅ **COMPLETE**. All 188 registered Android-to-JS handlers and 107 JavaScript-interface methods have been completely audited and documented in `docs/rea-investigation/BRIDGE_CONTRACT_AUDIT.md`. Verified: 174 active native send sites, 31 runtime probed/smoke handlers, 99 active interface methods, 14 unsent handlers, 8 unreferenced interface methods.
3. **Priority Item 3 (Content Round-Trip Specification)**: ✅ **COMPLETE**. Documented in `docs/rea-investigation/CONTENT_ROUNDTRIP_SPEC.md` covering `TiptapContentInfo` (10 fields), `NoteDataInTipTap`, blank/existing note flows, `callInitContentFromJava`, `callUpdateContentFromJava`, `onContentJsonUpdate`, unified title architecture (`onTitleChange`), `Ma()` legacy converter, `AttachData` / `PaintInfo` models, and verified runtime limitations.
4. **Next Engineering Milestone**: Priority Item 4 (Attachment and paint pipelines) and Item 5 (Dependency inventory completion), followed by user review and approval for Item 6 (Cross-platform architecture decision).

## Evidence-Based Priority Order

1. ~~**Standalone browser smoke test**~~ — ✅ **COMPLETE 2026-11-02 (15/15 PASS)**. Served unchanged bundle over local HTTP with separate host shim. Verified startup, attachment, blank-note init, text edits, formatting, content JSON updates, HTML/text extraction, and reload/restore. Production bundle not edited. See `SMOKE_TEST_RESULTS.md`.
2. ~~**Bridge contract completion**~~ — ✅ **COMPLETE 2026-11-02**. Validated all 188 Android-to-JS registrations and 107 `@JavascriptInterface` signatures against actual call sites, payload construction, callbacks, and host implementations. Separated active calls from exposed-but-unreferenced methods. Documented in `BRIDGE_CONTRACT_AUDIT.md`.
3. ~~**Content round-trip specification**~~ — ✅ **COMPLETE 2026-11-02**. Captured concrete `TiptapContentInfo`, TipTap JSON, HTML, and attachment outputs. Verified legacy HTML migration (`Ma()`), title flow (`onTitleChange`), and body serialization. Documented in `CONTENT_ROUNDTRIP_SPEC.md`.
4. **Attachment and paint pipelines**: Trace Android file/URI lifecycle, audio playback/recording, contact/calendar actions, image preprocessing, paint binary/protobuf storage, and undo integration. Define platform adapter boundaries before choosing host technology.
5. **Dependency inventory completion**: Trace manifest permissions, intents, account/cloud SDK calls, dynamic URL-card network requests, and native library entry points. Confirm which are needed for editor-only operation versus the full Notes application.
6. **Cross-platform architecture decision**: Make a framework and storage/backend decision only after the user approves a platform strategy based on the completed reverse engineering evidence.

**Do not proceed to a framework scaffold yet.** Priority items 1, 2, and 3 are complete; the next engineering milestone is item 4 (attachment and paint pipeline investigation) and item 5 (dependency inventory completion), followed by user approval of an architecture decision.

---

## 1. Executive Summary

The earlier executive summary below is preserved as historical context but was too confident. The current evidence-based status is:

- The bundle contains Vue/TipTap/ProseMirror and is structurally browser-based; standalone execution is now **verified** (15/15 PASS in headless Chromium, 2026-11-02), and the original bridge/native host is still required for several features (slash-menu UI, selection handles, skin/font assets, IME).
- Comprehensive audits verified all 188 Android→JS handler registrations (174 active, 14 unsent) and 107 Android `@JavascriptInterface` methods (99 active, 8 unreferenced). See `BRIDGE_CONTRACT_AUDIT.md`.
- The native content model carries TipTap JSON alongside legacy HTML and attachment metadata. Round-trip serialization and title flows are fully mapped. See `CONTENT_ROUNDTRIP_SPEC.md`.
- REA coverage and static decompilation confirm the database schema (Room v47, `nearme_note.db`).

**Confidence by layer:**

| Layer | Confidence | Basis |
|---|---|---|
| Editor (TipTap JS bundle) | ✅ High | Source inspected; standalone browser execution verified 15/15 PASS (2026-11-02) |
| Bridge protocol (WVJB) | ✅ High | All 188 handlers & 107 iface methods mapped, call sites identified, 26 probes verified |
| Content data model | ✅ High | TipTap JSON, legacy HTML, TiptapContentInfo, and NoteDataInTipTap verified |
| Local database schema | ✅ High | Room v47 schema extracted, 14 tables and key fields verified |
| Attachment handling | 🟡 Medium | Table structure known, binary blobs and lifecycle tracing remaining |
| Paint canvas (native) | 🟡 Medium | In-editor paint nodes mapped; C++ vector ink engine (libpaint.so) needs replacement |
| Cloud sync internals | 🔴 Low | OPLUS HeyTap — proprietary, must be replaced entirely by open backend |

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

### Success Criteria (Verified: 15/15 PASS on 2026-11-02)

- [x] Editor renders without fatal JavaScript errors in DevTools console (2 non-blocking OPPO `Selection.showHandles` exceptions caught by bridge; see `SMOKE_TEST_RESULTS.md`)
- [x] Typing text in the editor body works (Test 5 PASS via `execCommand('insertText')`)
- [x] Toolbar formatting (Bold, Italic, Underline, Strikethrough) applies correctly (Test 7 PASS)
- [x] Heading levels (MultiHeading1, MultiHeading2, MultiHeading3) work (Test 8 PASS via `callSetTitleStyleFromJava`)
- [x] Bullet and numbered lists work (Test 9 PASS via `<ul>` and `<ol>` wrappers)
- [x] `onContentJsonUpdate` fires on every edit (Test 12 PASS: 15 contentUpdate callbacks received)
- [x] `localStorage.getItem('coloros_notes_tiptap_json')` returns valid ProseMirror JSON after editing (Test 12 PASS: 3097 chars, root `type:doc`)
- [x] Calling `window._bridgeHandlers['callGetAllHTMLFromJava'](null, cb)` returns content text (Test 13 PASS)
- [x] Re-loading the page and calling `window.mockInitContent({ tiptapContentJson: ... })` restores note content (Test 15 PASS)
- [x] Tables, code blocks, and blockquotes render correctly (Test 10 PASS: table insertion, cell typing via CDP, row add)

### Notes

- Complete test suite, CDP driver, and reproduction script are located at `apk-work/standalone-smoke-test/` (`node run_smoke.mjs`).
- The `Ma()` function in the bundle is the legacy HTML→TipTap JSON converter at offset 228859; fully documented in `docs/rea-investigation/CONTENT_ROUNDTRIP_SPEC.md`.

---

## 3. Historical Proposal Only (Unapproved): Flutter App Shell with WebView

> [!IMPORTANT]
> **HISTORICAL PROPOSAL ONLY — NOT AN APPROVED DECISION**  
> The Flutter and Supabase architecture outlined in Sections 3 through 7 represents early speculative planning sketched prior to complete reverse engineering. No framework, client runtime, or backend service has been selected or approved by the user. Per project guidelines, no application scaffolding may be generated until Phase 1 reverse engineering (attachment/paint pipeline analysis and dependency inventory completion) is reviewed and signed off.

**Timeline**: 1–2 weeks (Historical Estimate)  
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

## 10. Architecture Decision Records (Historical & Status)

> [!NOTE]
> Formal framework and backend architecture decisions remain **PENDING USER APPROVAL**. The ADRs below document current evaluation status following Phase 1 reverse engineering.

### ADR-001: Reuse Existing TipTap Editor Bundle

**Decision**: Reuse the extracted `assets/tiptap/` production bundle directly.  
**Rationale**: Standalone browser execution is verified (15/15 PASS in Chromium 156). Reusing the bundle preserves 100% of the authentic TipTap/ProseMirror behaviors, custom marks, tables, and block styling without months of reimplementation effort.  
**Trade-offs**: Bound to bundle version 16.7.5; requires bridging native host calls.  
**Status**: RECOMMENDED (Backed by 15/15 PASS smoke test and bridge audit)

### ADR-002: Cross-Platform Client Shell Selection

**Proposal**: Evaluating Flutter vs. Tauri / Web-Native vs. Compose Multiplatform.  
**Rationale**: Needs 1:1 COUI design system replication across Android (Universal OEM), Arch Linux (Wayland/Hyprland), Windows, and macOS.  
**Status**: **PROPOSED / PENDING USER APPROVAL (Not yet decided)**

### ADR-003: TipTap JSON as Canonical Content Format

**Decision**: ProseMirror document JSON (`tiptap_content_json`) is the primary source of truth; HTML is retained as a legacy/export format.  
**Rationale**: ProseMirror JSON is structured, deterministic, lossless, and supports fine-grained synchronization. Documented in `docs/rea-investigation/CONTENT_ROUNDTRIP_SPEC.md`.  
**Trade-offs**: Requires legacy HTML converter `Ma()` for pre-existing notes.  
**Status**: RECOMMENDED (Backed by verified content round-trip findings)

### ADR-004: Cloud Backend Selection

**Proposal**: Evaluating open-source backend solutions (Supabase vs. Appwrite vs. Custom SQLite Sync Server) to replace proprietary HeyTap/OPUS CloudKit.  
**Rationale**: Original cloud synchronization relies on signature-protected OPPO ID tokens and proprietary servers.  
**Status**: **PROPOSED / PENDING USER APPROVAL (Not yet decided)**

### ADR-005: Offline-First Local SQLite Primary Store

**Decision**: Offline-first operation backed by local SQLite schema strictly conforming to the verified Room v47 `nearme_note.db` schema (`rich_notes`, `attachments`, `folders`, `todo`).  
**Rationale**: Eliminates network latency; ensures local data ownership and cross-platform portability.  
**Status**: RECOMMENDED (Backed by verified Room v47 decompilation)

### ADR-006: Paint Canvas & Vector Ink Architecture

**Proposal**: In-editor paint blocks embed via `paint` nodes referencing `paintid` and preview images. The standalone vector ink rasterization engine (`libpaint.so` / `libinkEngineNative.so`) requires an open-source cross-platform substitute (e.g. Skia / flutter_drawing_board or web canvas).  
**Status**: DEFERRED TO MILESTONE 4 (Pending Attachment & Paint Pipeline Analysis)

---

## 11. Open Questions & Remaining Investigation Items

1. **Paint Binary Stroke Format**: What is the internal binary format used by `libinkEngineNative.so` and `paint_notes` to serialize handwriting vector strokes? (To be addressed in Priority Item 4: Attachment and paint pipeline analysis).
2. **Audio Recording Container**: Does the native audio recorder produce standard AAC/MP4 or Opus/WebM files, and how does `attachment_lrc` synchronize audio timeline markers with speech logs?
3. **Third-Party Platform Adapters**: What platform channel abstractions are needed on Linux Wayland (Hyprland clipboard/windowing) versus Android? (To be finalized in Priority Item 5: Dependency inventory completion).

4. **Editor bundle update mechanism**: Does OPPO ship editor bundle updates with the APK or via a separate CDN? If CDN, can we intercept them?

5. **Table/image resize handlers**: The editor has drag-to-resize for tables and images. Do these depend on any native bridge calls or are they fully in-browser?

6. **Encryption at rest**: Does ColorOS Notes encrypt the SQLite database? If so, with what key derivation (device key, user password)?

7. **WVJB message framing**: Is the WVJB used here the standard WebViewJavascriptBridge library (GitHub: marcuswestin/WebViewJavascriptBridge) or a custom OPLUS variant? The handshake sequence should be confirmed before reimplementing.

8. **Desktop file picker integration**: On Linux/Wayland, file picker dialogs require `xdg-portal`. Does `flutter_inappwebview`'s `<input type=file>` handling work through the portal?

9. **Folder color/icon metadata**: The original app shows colored folders with icons. Are these stored in the `folders` table or inferred from folder name?

10. **Multi-account support**: Does the original app support multiple accounts? Should our implementation support it from day one?

---

*End of NEXT_STEPS.md*
