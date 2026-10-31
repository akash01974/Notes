# Standalone Editor Feasibility

Status: static feasibility assessment only. No browser launch was performed. Production assets remain unchanged.

## Finding

[INFERRED] A desktop Chromium proof of concept is plausible because the host is a module-based HTML page and the editing/document operations are implemented in bundled Vue/TipTap/ProseMirror JavaScript. It is not yet verified that the application starts without native host behavior. The editor depends on injected host globals and native callback semantics, and several user-facing features need platform adapters.

## Required Runtime Assets

- Serve the original `apk-work/extracted/assets/tiptap/` tree without changing it. Preserve `index.html`, `assets/`, `icons/`, and `lottie/` relative paths.
- [VERIFIED] `index.html` loads `./assets/index.js` as `type="module"`, uses `#app`, and preloads module chunks (`index.html:8-31`). Use localhost HTTP rather than opening the file directly; ES module loading from `file://` is not a reliable assumption.
- [VERIFIED] The bundle includes Vue, TipTap, ProseMirror model/state/view/transform/tables/commands, HTML parser/serializer, `html2canvas`, Lottie, and UI helper chunks, plus local icon/animation assets.
- [UNKNOWN] Runtime missing-file or cross-origin errors, font load behavior, and whether every referenced asset is present for every path were not exercised.

## Host Globals and Bridge Contract

The production bundle must not be modified. A separate harness can install these before the module executes:

| Global | Role | Standalone implementation |
|---|---|---|
| `window.WVJBInterface.notice(jsonString)` | JS-to-host WVJB outbound transport | Parse/log requests, dispatch selected operations to local host code, and deliver callback replies through the bundle’s own bridge response mechanism. |
| `window.injectedObject` | Android `@JavascriptInterface`-equivalent callbacks and synchronous queries | Supply callbacks for content updates, menu requests, selection state, attachment actions, IME/device queries, paint, cards, and drag/drop. Persist `onContentJsonUpdate` / `onTitleJsonUpdate` through host storage if desired. Correct synchronous return types matter (`boolean`, string, or number as declared in `cache/a.java`). |
| `window.injectedAppVueObject.onAppVueMounted()` | App-level host handshake | Return a compatible object containing `colorOSVersion`; whether the exact value is used to gate features is `[UNKNOWN]`. |

[VERIFIED] `index.js` itself installs `WebViewJavascriptBridge` (handler registry and `_handleMessageFromJava`) and routes outbound messages to `WVJBInterface.notice(...)`, falling back to `prompt("_wvjbxx", ...)` (`index.js:534`, near offset 19103). Do not replace the bundle’s bridge object before it loads. After registration, the harness can inject a message with `_handleMessageFromJava({handlerName, data, callbackId})`; the exact response envelope should be exercised against the bundle’s callback code before relying on it.

### Proposed Mock Bridge Shape

This is an interface sketch, not a production implementation and not a modification to `mock_bridge.js`:

```js
window.injectedObject = new Proxy({
  onContentJsonUpdate: json => host.saveBodyJson(json),
  onTitleJsonUpdate: json => host.saveTitleJson(json),
  isImeVisible: () => false,
  hideSoftInput: () => document.activeElement?.blur(),
  isOverScrolling: () => false,
  isBlockHorizontalSlidingDisable: () => false,
  isNewTblVersion: () => true,
  handlePaste: () => null,
  startBlockDragFromJs: () => false,
  startDragFromJs: () => false,
  onLongClick: () => false,
  getAndroidVersion: () => 0,
  getAndroidString: key => key,
  onTipTapMounted: () => host.editorReady(),
  showRichTextFormatMenu: json => host.showWebSlashMenu(JSON.parse(json)),
}, {
  get(target, name) {
    return name in target ? target[name] : (...args) => host.onNativeCallback(name, args);
  }
});

window.injectedAppVueObject = {
  onAppVueMounted: () => ({ colorOSVersion: 0 })
};

window.WVJBInterface = {
  notice: json => host.onBridgeMessage(JSON.parse(json))
};
```

`host` above is the harness-owned adapter. The Proxy is only a way to log and stub unknown callback names during discovery; feature-complete operation requires explicit handlers and return values. Treat callback messages and all user-provided HTML/URLs as untrusted input.

## Initialization and Data

1. Install injected globals before module execution.
2. Load `index.html` and allow Vue to mount at `#app`.
3. Wait for App/Tiptap readiness (`onAppVueMounted`, `onTipTapMounted` callbacks are indicators, not proof initialization has completed).
4. Send `callAttachTipTapFromJava` as needed, then initialize with `callInitContentFromJava`.
5. Use the ten-field `TiptapContentInfo` shape. `subAttachments`, `pageResults`, `pictureAttrs`, and TipTap JSON fields are strings in the Android model; preserve that distinction. Source: `com/oplus/notes/webview/data/TiptapContentInfo.java:24-37, 129-149`.
6. Capture `onContentJsonUpdate` and title callbacks for durable storage. The editor bundle did not expose a direct localStorage/sessionStorage/IndexedDB reference in the targeted scan; the Android host owns persistence.

[VERIFIED] Native init/update calls are sent from `com/oplus/notes/webview/container/web/g.java:168-190`. The body JSON is preferred when non-null by `callInitContentFromJava` (`index.js:534`, offset 817407). `callUpdateContentFromJava` replaces content and consumes attachment/page/picture metadata (`index.js:362`, offset 612422).

## Browser and Native Requirements

| Concern | Standalone consequence |
|---|---|
| DOM, ES modules, CSS, selection, timers, local chunk `fetch()` | Standard Chromium capabilities; runtime test required. |
| Clipboard | Native `handlePaste`/`handleCopyOrCut` flows need browser clipboard integration and permission/user-gesture handling. |
| IME/keyboard | Browser focus/blur is available; Android IME geometry and native toolbar coordination are not. |
| File/image/audio | Browser file picker, Blob/URL and media APIs can substitute, but Android `content://` paths and attachment IDs need mapping and persistence. |
| Contacts/calendar/telephony | Requires user-mediated OS APIs, protocol handlers, or graceful fallback; no browser-compatible implementation is included in the editor bundle. |
| Drag and drop | Browser drag events can support in-document block moves; cross-application Android drag callbacks require an adapter. |
| Paint | Native paint node and serialization are not proven browser-portable. This is a major feature-parity blocker. |
| URL cards | Android `UrlContentGetter` and `getUrlTitle` are host-side. Browser fetch may be blocked by CORS and must not be assumed equivalent. |
| Cloud, account, AI | Outside editor scope; replace with separately chosen services or disable with explicit product behavior. |

## Blockers and Verification Plan

- [UNKNOWN] Does the page boot with the three host globals and default content, without Android callbacks that are not safely stubbed?
- [UNKNOWN] Which callback methods are invoked synchronously during module/App mount, and what exact return values are required?
- [UNKNOWN] Are `file://` or custom local schemes used by the original? The extracted HTML is relative-path-based; Android host URL construction still needs confirmation.
- [UNKNOWN] Do content JSON, legacy HTML conversion, attachments, and title JSON round-trip losslessly outside the original WebView?
- [UNKNOWN] What is the runtime paint implementation boundary and stored attachment format?
- [UNKNOWN] Can dynamic module-preload fetches and all local fonts/assets resolve under a strict local origin/CSP?

Next check: run a separate local HTTP harness against an untouched bundle, record browser console/network errors, then test blank initialization, typing, formatting, JSON update, HTML/text retrieval, and one table. Do not treat a successful blank render as proof of feature completeness.