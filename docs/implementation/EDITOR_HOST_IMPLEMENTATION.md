# Editor Host & Bridge Implementation — ColorOS Notes Rebuild

| Field | Value |
|---|---|
| **Status** | IMPLEMENTATION SPECIFICATION — Milestone 3 Deliverable |
| **Date** | 2026-11-02 |
| **Subsystem** | Isolated WebView Host & WVJB Bridge Dispatcher |
| **Tested Engine** | Chromium / WebKit2GTK via `flutter_inappwebview: ^6.1.5` |
| **Asset Source** | `app/assets/tiptap/` (Unchanged production bundle v16.7.5) |

---

## 1. Architectural Architecture & Isolation Strategy

The ColorOS Notes editor is an unchanged, production-compiled Vue 3 + TipTap/ProseMirror web bundle (`assets/tiptap/index.js`, 823 KB). To maintain 100% behavioral fidelity without coupling the Flutter application directly to web DOM internals:
1. The editor executes in a strictly sandboxed, isolated WebView container (`EditorView`).
2. All bidirectional communication flows through an asynchronous bridge host (`EditorBridgeHost`).
3. The host pre-injects a JavaScript compatibility shim at `document_start` before any bundle script loads.

```
+─────────────────────────────────────────────────────────────────────────────+
|                          FLUTTER APPLICATION SHELL                          |
|                                                                             |
|  ┌─────────────────────────────────────┐   ┌─────────────────────────────┐  |
|  │          NoteEditorScreen           │   │      NoteRepository         │  |
|  │  - COUI Toolbar (Bold, Tables, etc.)│   │  - Debounced Auto-Save      │  |
|  │  - Undo/Redo State Listeners        │   │  - SQLite Room v47 Storage  │  |
|  └──────────────────┬──────────────────┘   └──────────────▲──────────────┘  |
|                     │ User Commands                       │ Save Mutations  |
|                     ▼                                     │                 |
|  ┌────────────────────────────────────────────────────────┴──────────────┐  |
|  │                         EditorBridgeHost                              │  |
|  │  - Constructs TiptapContentInfo (10 Fields)                           │  |
|  │  - Dispatches callSetBoldFromJava, callInsertTableFromJava, etc.       │  |
|  │  - Receives onContentJsonUpdate, onTitleChange, onFormatStateChange   │  |
|  └──────────────────▲────────────────────────────────────────────────────┘  |
+─────────────────────┼───────────────────────────────────────────────────────+
                      │ evaluateJavascript / addJavaScriptHandler
                      ▼
+─────────────────────────────────────────────────────────────────────────────+
|                         WEBVIEW HOST RUNTIME CONTAINER                      |
|                                                                             |
|  ┌───────────────────────────────────────────────────────────────────────┐  |
|  │                    Pre-Injected Host Compatibility Shim               │  |
|  │  - window.WebViewJavascriptBridge (registerHandler, _handleMessage)   │  |
|  │  - window.injectedObject (Proxy router to flutter_inappwebview)       │  |
|  │  - window.Gc.showHandles (Polyfill for OPPO selection handles)        │  |
|  └───────────────────────────────────┬───────────────────────────────────┘  |
|                                      │                                      |
|  ┌───────────────────────────────────▼───────────────────────────────────┐  |
|  │              Unchanged TipTap / ProseMirror Production Bundle         │  |
|  │  - Vue 3 Component Tree                                               │  |
|  │  - ProseMirror EditorState, Transaction Dispatch & Custom Marks       │  |
|  │  - Table Management, Multi-Heading Nodes, Indentation Rules           │  |
|  └───────────────────────────────────────────────────────────────────────┘  |
+─────────────────────────────────────────────────────────────────────────────+
```

---

## 2. Pre-Injected Host Compatibility Shim Specification

Before `index.html` loads the vendor scripts (`@vue.js`, `prosemirror-*.js`, `index.js`), the WebView container injects the following shim at `UserScriptInjectionTime.AT_DOCUMENT_START`:

```javascript
// Pre-Injected Host Compatibility Shim
window._bridgeHandlers = {};

// 1. Emulate WebViewJavascriptBridge (WVJB) Protocol
window.WebViewJavascriptBridge = {
  registerHandler: function(name, fn) {
    window._bridgeHandlers[name] = fn;
  },
  callHandler: function(name, data, cb) {
    window.flutter_inappwebview.callHandler('onJsBridgeCall', name, data);
  },
  _handleMessageFromJava: function(jsonStr) {
    try {
      var msg = JSON.parse(jsonStr);
      if (msg.handlerName && window._bridgeHandlers[msg.handlerName]) {
        window._bridgeHandlers[msg.handlerName](msg.data, function() {});
      }
    } catch (e) {
      console.error('WVJB Dispatch error', e);
    }
  }
};

// 2. Emulate Native injectedObject Interface via ES6 Proxy
window.injectedObject = new Proxy({}, {
  get: function(target, prop) {
    return function(...args) {
      window.flutter_inappwebview.callHandler('onJsBridgeCall', prop, ...args);
    };
  }
});

// 3. Polyfill ColorOS TBL Selection Handle API
window.Gc = window.Gc || {
  showHandles: function() { /* polyfilled via DOM selection or no-op */ },
  hideHandles: function() { /* no-op */ }
};
```

---

## 3. Content Initialization Flow (`TiptapContentInfo`)

When opening an existing note or creating a blank note:
1. `EditorView` signals `onReady` once the webview fires `onLoadStop`.
2. The host constructs a `TiptapContentInfo` object adhering strictly to the verified 10-field wire format:
   ```json
   {
     "guid": "note-uuid-001",
     "titleHintText": "Title",
     "title": "Existing Title",
     "content": "<p>Existing HTML Content</p>",
     "subAttachments": [],
     "pageResults": [],
     "pictureAttrs": {},
     "tiptapTitleJson": null,
     "tiptapContentJson": null,
     "isDoingSummary": false
   }
   ```
3. The host dispatches `callInitContentFromJava`:
   ```dart
   final info = TiptapContentInfo(
     guid: noteId,
     title: noteTitle,
     content: noteHtml,
   );
   await bridgeHost.initContent(info);
   ```
4. TipTap parses the JSON/HTML, constructs the ProseMirror `doc` state, renders the content-editable DOM, and dispatches `notifyEditorLoaded` followed by `notifyEditorFocused`.

---

## 4. Debounced Auto-Save Pipeline

To ensure sub-16ms typing response without flooding SQLite write transactions:
1. As the user types, TipTap emits `onContentJsonUpdate(jsonString)` and `onTitleChange(titleString)`.
2. `EditorBridgeHost` captures these calls and delivers them to `NoteEditorScreen`.
3. `NoteEditorScreen` starts a **500ms debouncing timer**:
   - If further typing occurs within 500ms, the previous timer is cancelled and restarted.
   - Once typing pauses for 500ms, the note's state transitions to `state = 2` (Modified), `update_time` advances to `DateTime.now().millisecondsSinceEpoch`, and the note is atomically committed to `NoteRepository`.
4. When the user taps the Back button or navigates away, any pending debounced save executes synchronously in `dispose()`, ensuring zero data loss.
