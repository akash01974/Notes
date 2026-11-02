# Smoke Test Results — ColorOS Notes TipTap Editor, Standalone in Browser

**Date:** 2026-11-02
**Question answered:** Does the *original, unmodified* Vue 3 + TipTap bundle extracted from `com.coloros.note` v16.7.5 run in a plain Chromium browser with no Android/ColorOS host?
**Answer:** **Yes — 15/15 tests PASS.** The production bundle `apk-work/extracted/assets/tiptap/assets/index.js` is served byte-for-byte unchanged; only the host side (bridge) is mocked.

---

## How to reproduce

```bash
cd apk-work/standalone-smoke-test
node run_smoke.mjs        # Node v26, zero installs; spawns server.js :8765 + helium headless CDP :9333
```

Output lands in `apk-work/standalone-smoke-test/results/` (`results.json`, `console_full.log`, screenshots).

| Run parameter | Value |
|---|---|
| Browser | `helium-browser` headless, **Chrome/156.0.8078.47** (Chromium 156, CDP-driven) |
| Automation | Node 26 built-in `WebSocket`/`fetch` — custom CDP client (`cdp.mjs`), no packages |
| Bundle served | `/tiptap/assets/*` — original extracted assets, relative paths preserved via `<base href="/tiptap/">` |
| Host mock | `/vendor/mock_bridge.js` (existing `rea-tools/mock_bridge.js`, served **read-only/unmodified**) + harness-owned `bridge_host.js` capture/injection layer |
| Final run | `2026-11-02T10:48Z`, **`SUMMARY {"PASS":15}`**, 936 console lines, **2 console errors, 0 network failures** |

---

## Test matrix — 15/15 PASS

| # | Test | Status | Method | Observed evidence |
|---|---|---|---|---|
| 1 | Application startup | **PASS** | Load `http://127.0.0.1:8765/`, poll `readyState` + first render | `readyState=complete`, `#app` present with 1 child, body HTML 3848 chars, href correct |
| 2 | Vue mounting | **PASS** | Poll `#app` content / `el.__vue_app__` | Vue marker level 2; flags `appVueMounted:1, tipTapMounted:1, attachSent:true, basicCssApplied:true, uiModeApplied:true` |
| 3 | TipTap initialization | **PASS** | Wait for `.ProseMirror` contenteditable + `onTipTapMounted` | Editor attached (645 chars HTML), `onTipTapMounted` fired ×1; first block `<div class="block-wrapper topLevel is-empty" blocktype="MultiHeading1">` |
| 4 | Blank-note init | **PASS** | Fresh profile → mock auto-sends `callInitContentFromJava` on `onTipTapMounted` | `editor text empty=true`, init log seen, `localStorage=null` (fresh profile) |
| 5 | Typing and editing | **PASS** | Focus `.ProseMirror`, `execCommand('insertText')` (native editing path) | `execCommand` returned `true`; editor text = `"Hello ColorOS Notes — standalone smoke test."` |
| 6 | Title editing | **PASS** | Select first block → bridge `callSetTitleStyleFromJava {type:"title"}` → type | `multi-heading` attrs `["P:1"]`, first block = `blocktype="MultiHeading1" data-placeholder="title"`, typed text present, **`onTitleChange` calls 1 → 2** (console: `onTitleChange: Smoke Note Title`) |
| 7 | Bold and italic | **PASS** | Select-all, `Ctrl+B` then `Ctrl+I` | `<b>Smoke Note Title</b>` then `<i>Smoke Note Title</i>` in DOM |
| 8 | Headings | **PASS** | `/`-slash probe on empty block + `callSetTitleStyleFromJava {type:"subtitle"}` on body block | `showRichTextFormatMenu` **0 → 1** (`CustomSuggestion-Start` in console); `multi-heading` attrs `["P:1","P:2"]`; 0 native `<h1-h3>` (see finding 5) |
| 9 | Bulleted & numbered lists | **PASS** | Select-all, `Ctrl+Shift+8` / `Ctrl+Shift+7` | `<ul><div blocktype="listItem">…` and `<ol start="1">…` wrappers rendered |
| 10 | Table insertion & editing | **PASS** | `callInsertTableFromJava` → **CDP mouse click** into first cell → type → `callAddRowInTableFromJava` | insert response `{"ok":true,"data":"true"}`, 2×2 table; click at (104,147), `execCommand=true`, `Cell A1` in cell; addRow `{"ok":true,"data":"true"}` → **3 rows** |
| 11 | Undo and redo | **PASS** | `Ctrl+Z` / `Ctrl+Shift+Z` with `UNDO_MARKER_XYZ` round-trip | undo len 119 → 104, redo restored 119; state callbacks `undo:2, redo:5` |
| 12 | Content JSON updates | **PASS** | Poll `localStorage.coloros_notes_tiptap_json` | TipTap JSON persisted, 3097 chars, root `type:doc`; callbacks `contentUpdate:15, titleChange:5` |
| 13 | HTML retrieval | **PASS** | Inject `callGetAllHTMLFromJava`, await response envelope | `ok:true`, value contains `Smoke Note Title`, `Hello ColorOS Notes…`, `Cell A1`, `UNDO_MARKER_XYZ` |
| 14 | Plain-text retrieval | **PASS** | Inject `callGetTextAndHtmlFromJava`, await response | `ok:true`, keys `text / htmlData / textIncludePaint`, text snippet correct |
| 15 | Reload & restore | **PASS** | `Page.reload`, fresh flag counter; mock auto-loads saved JSON | Full note restored: title, body, table cells, undo marker all present |

**FAIL: none. NOT TESTED: none.**

---

## Boot sequence the harness must reproduce (verified against bundle source)

The Android host sends these in order; the harness injects them from `bridge_host.js`:

1. **Page load** → Vue mounts (`appVueMounted`), editor component registers its 190+ `call…FromJava` handlers during setup.
2. **`callAttachTipTapFromJava("true")`** (harness: +250 ms after `appVueMounted`) — sets the `v-if` ref that mounts the TipTap editor. Without it the app hangs on the loading spinner forever.
3. **`callSetBasicCssParamsFromJava`** (harness: 50 ms retry loop after `tipTapMounted`) — `BasicCssParams` JSON incl. 8-field `themeColors`. Without it the first selection change throws `Cannot read properties of null (reading 'textColorHighlight')` (`index.js:525 onSelectionDebounce → index.js:13`). Sent within 50 ms to beat the editor's initial selection debounce.
4. **`callSetUiModeFromJava("3")`** (same loop) — `"3"` = `EDITOR_UI_MODE_EDIT` (`"1"` = VIEW, `"2"` = OVERLAY). The bundle boots in VIEW mode, which adds `hide-placeholder` to empty blocks (`.hide-placeholder p:before{opacity:0}`), so the blank-note placeholder never paints.
5. **`callInitContentFromJava`** — sent *by the mock itself* on `onTipTapMounted` (blank note payload: `guid, titleHintText:"Note title", title:"", content:""…`).
6. Screenshots confirm the boot state: grey `title` placeholder top-left, edit mode (`tiptapContentParentEditMode`).

## Console & network evidence

- **Transcript:** 936 lines → `results/console_full.log`.
- **Console errors: 2** — both `Gc(...).showHandles is not a function` (thrown inside `callSetTitleStyleFromJava`, caught by the bridge wrapper).
  - `Gc()` = `window.getSelection()`; `.showHandles()` is an **OPPO TBL-WebView-only extension**. Native `isNewTblVersion` = `usingTBLWebView && coreVersion >= NEW_TBL_VERSION` → `true` on device, absent in stock Chromium. The style application itself succeeds *before* the throw. **Documented as native-required, not a harness defect.**
- **Network failures: 0** (`favicon.ico` 404 eliminated via `<link rel="icon" href="data:,">`).
- **Page-side warning: 1** benign `ResizeObserver loop completed with undelivered notifications`.
- Zero `textColorHighlight` crashes after the `themeColors` injection fix (grep of transcript = payload echo only).

## Screenshots

| Boot (blank note, edit mode, `title` placeholder) | After full test run |
|---|---|
| ![boot](../../apk-work/standalone-smoke-test/results/01_boot.png) | ![restored](../../apk-work/standalone-smoke-test/results/02_after_restore.png) |

`02_after_restore.png` shows real rendered output: ordered list with bold/italic text, 2-row table with `Cell A1`, `UNDO_MARKER_XYZ`.

---

## Mocked vs native-required

### Mock coverage (works in browser)

- `rea-tools/mock_bridge.js` (served read-only): **106 `injectedObject` methods** + `injectedAppVueObject`, `WVJBInterface.notice` routing, auto-init/auto-load, localStorage persistence (`coloros_notes_tiptap_json`).
- `bridge_host.js` (harness-owned): capture layer (records every host message, callback, response, notice), **`isExport()` stub → `false`** (the one interface method the mock lacks, 104→105/105 covered), plus the attach / themeColors / uiMode injections above.
- Verified by real callback signatures and synchronous returns — response envelopes (`responseId`/`responseData`) awaited per call, not Proxy fakes.

### Native-required (cannot run in stock Chromium)

| Capability | Where | Impact in harness |
|---|---|---|
| `Selection.showHandles()` | OPPO TBL WebView extension, called after title-style changes | 2 caught TypeErrors; styling still applies |
| Slash/heading menu **rendering** | `/` fires `CustomSuggestion` → `showRichTextFormatMenu(query, clientRect)` request to native; the menu UI is native, not web | Bridge request verified (0→1); menu UI itself NOT TESTED in browser |
| Skin assets (`skin_top_img/bottom`), system font (`Sys_Sans_Hans_Font`) | Native file/asset providers | Cosmetic only; font-load class `hidden-when-font-not-loaded` is present but does not block editing |
| Text-selection handles overlay, IME (`isImeVisible`), paint blocks | Android WebView/ColorOS | Out of scope for smoke test |

## Key findings that change the rebuild assumptions

1. **No separate title input exists in web.** Title = first block styled by `callSetTitleStyleFromJava` → MultiHeading attribute `multi-heading="1"` (`blocktype="MultiHeading1"`, `data-placeholder="title"`); `observeTitleText` reports it via `onTitleChange`.
2. **No `setHeading`/`toggleHeading` path exists in this build.** Headings ARE the MultiHeading mechanism (`"1"|"2"|"3"` = title/subtitle/small_title enum values `title/subtitle/small_title`). Native `<h1-h3>` tags: 0.
3. **Host must send `callSetUiModeFromJava("3")`** or the editor renders in VIEW mode (no placeholder, view-mode parent class).
4. **`themeColors` (8 fields) is mandatory** — null causes a crash on every selection change.
5. **Table cell editing requires real pointer events** — range-based selection into `td` does not stick (`td` not focusable); CDP mouse click works. `callAddRowInTableFromJava` throws `RangeError: No cell found around position 58` unless the caret is already inside the table.

## Reusability verdict

**Reusable as-is.** `apk-work/standalone-smoke-test/` is a zero-install, repeatable harness (`node run_smoke.mjs`) that runs the *original* bundle in stock Chromium and captures every bridge message. It is the test rig for the next phase: probing further features (paste, task lists, paint blocks, search) against the same served bundle without an Android device. `mock_bridge.js` in `rea-tools/` remains untouched and continues to be the reusable mock for any standalone-editor experiment.
