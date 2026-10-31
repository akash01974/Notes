# Bridge API Reference — ColorOS Notes TipTap Editor

> **Investigation Status**: Reverse-engineered from `WVJBWebView.java`, `WVJBWebView.kt`, `TiptapContentInfo.kt`, and minified `index.js` (IIFE bundle).
> Labels: **[VERIFIED]** = confirmed from source; **[INFERRED]** = derived from standard protocol or context; **[UNKNOWN]** = not confirmed.

---

## 1. Overview

### Bridge Protocol

The editor uses a **WebViewJavascriptBridge (WVJB)**-style bidirectional messaging protocol between the Android host and the TipTap WebView.

#### JS → Native [VERIFIED from `WVJBWebView.kt` L114–120, `index.js` IIFE]

| Path | Detail |
|------|--------|
| **Primary** | `window.WVJBInterface.notice(jsonString)` — `WVJBInterface` is a `@JavascriptInterface`-annotated inner class `a` in `WVJBWebView.kt`. Its `notice(String str)` method sends a `Message` to an internal handler `i`. |
| **Fallback** | `prompt("_wvjbxx", jsonString)` — used when `window.WVJBInterface` is `null` (e.g., in unit tests or browser preview). |

#### Native → JS [INFERRED from standard WVJB protocol]

Android calls:
```javascript
webView.evaluateJavascript(
  "window.WebViewJavascriptBridge._handleMessageFromJava(" + json + ")",
  null
);
```

#### Message Format

**Request** (either direction):
```json
{
  "handlerName": "callInitContentFromJava",
  "data": "<any>",
  "callbackId": "cb_3_1698765432100"
}
```

**Response** (callback reply):
```json
{
  "responseId": "cb_3_1698765432100",
  "responseData": "<any>"
}
```

#### Callback System [VERIFIED]

- JS generates callback IDs in the form `cb_N_timestamp` (e.g., `cb_3_1698765432100`).
- Callbacks are stored in a `Map` keyed by their ID.
- Android echoes the `callbackId` back in the `responseId` field to route the response to the correct JS callback.

#### Handler Registration

- **Native → JS**: JS side registers named handlers via `registerHandler(name, fn)`. Android invokes these by `handlerName`.
- **JS → Native**: JS calls methods directly on `window.injectedObject` (a `@JavascriptInterface`-annotated Java object) or via the WVJB `notice()` path.

Total registered Native→JS handlers: **188** [VERIFIED from `index.js`].

---

## 2. Native → JS Handlers

> Android calls these by sending a WVJB message with the corresponding `handlerName`. The JS side has registered each via `registerHandler(...)`.

### 2.1 Content Lifecycle

| Handler Name | Direction | Input Parameters | Callback Response | Purpose | Native Implementation | Independently Implementable? |
|---|---|---|---|---|---|---|
| `callAttachTipTapFromJava` | Native→JS | JSON string: `{ scale?: number, uiMode?: string }` | `"done"` | Creates or destroys the TipTap Vue component. Entry point for editor lifecycle. | `App.vue` | ✅ Yes — mount/unmount Vue app |
| `callInitContentFromJava` | Native→JS | JSON string: `TiptapContentInfo` (see schema below) | `"done"` | Loads initial note content into the editor. Converts legacy HTML→TipTap JSON via `Ma()` if `tiptapContentJson` is null. | `index.js` handler + `Ma()` | ✅ Yes — provide stub `TiptapContentInfo` |
| `callUpdateContentFromJava` | Native→JS | JSON string: `TiptapContentInfo` (same shape as Init) | `"done"` | Replaces editor content entirely. Calls `clearContent().setContent()`. | `index.js` | ✅ Yes |
| `callSetTextFromJava` | Native→JS | Plain string (text to insert) | `"success"` or `"fail"` | Inserts plain text at current cursor position. | `index.js` | ✅ Yes |
| `callClearContentFromJava` | Native→JS | (any / ignored) | `"done"` | Clears all editor content. | `index.js` | ✅ Yes |
| `callInsertTextWithHistoryFromJava` | Native→JS | (text data) | (not specified) | Inserts text while maintaining undo history. | `index.js` | ✅ Yes |
| `callInsertHintTextFromJava` | Native→JS | (hint text data) | (not specified) | Inserts hint/suggestion text (e.g., autocomplete). | `index.js` | ✅ Yes |
| `callInsertPhoneHintTextFromJava` | Native→JS | (phone number string) | (not specified) | Inserts a phone number hint. | `index.js` | ✅ Yes |
| `callNotifyIdleFromJava` | Native→JS | (any) | (not specified) | Notifies editor that the Android host is in an idle state. | `index.js` | ✅ Yes — no-op or fire custom event |

**`TiptapContentInfo` JSON Schema** [VERIFIED from `TiptapContentInfo.kt`]:
```json
{
  "guid": "",
  "titleHintText": "",
  "title": "",
  "content": "(legacy HTML string)",
  "subAttachments": "[]",
  "pageResults": "",
  "pictureAttrs": "[]",
  "tiptapTitleJson": null,
  "tiptapContentJson": null,
  "isDoingSummary": false
}
```

---

### 2.2 Content Retrieval

| Handler Name | Direction | Input Parameters | Callback Response | Purpose | Native Implementation | Independently Implementable? |
|---|---|---|---|---|---|---|
| `callGetAllHTMLFromJava` | Native→JS | (any) | HTML string | Returns full HTML of editor content via `ch(view, doc.content)`. | `index.js` (`ch()`) | ✅ Yes |
| `callGetTextAndHtmlFromJava` | Native→JS | (any) | `{ text: string, htmlData: { content: string }, textIncludePaint: string }` | Returns text and HTML simultaneously. | `index.js` | ✅ Yes |
| `callGetAttachmentsFromJava` | Native→JS | (any) | JSON array of attachment objects | Returns all attachment nodes via `GM(editor)`. | `index.js` (`GM()`) | ✅ Yes |
| `callGetSelectTextFromJava` | Native→JS | (any) | string | Returns currently selected text. | `index.js` | ✅ Yes |
| `callGetSelectedTextFromJava` | Native→JS | (any) | string | Returns selected text (alternate handler). | `index.js` | ✅ Yes |
| `callSelectAndGetAllTextFromJava` | Native→JS | `{ editor: any, isAiKit: boolean }` | `{ text: string, attachMap: any }` | Selects all content, returns text + attachment map. | `index.js` | ✅ Yes |
| `callSelectAndGetForwardAllTextFromJava` | Native→JS | (any) | (text/HTML) | Selects forward text for AIGC processing. | `index.js` | ⚠️ Partial — AIGC-specific logic |
| `callOnAIGCGetSelectHtmlTextFromJava` | Native→JS | (any) | HTML string | Returns selected HTML for AI rewrite. | `index.js` | ⚠️ Partial |
| `callGetEditorsHeightFromJava` | Native→JS | (any) | number (px) | Returns total editor height in pixels. | `index.js` | ✅ Yes |
| `callGetCursorStartPosition` | Native→JS | (any) | number | Returns cursor start position (character offset). | `index.js` | ✅ Yes |
| `callGetBlockContentWidthFromJava` | Native→JS | (any) | number (px) | Returns the block content area width. | `index.js` | ✅ Yes |
| `callGetFocusedEditorFromJava` | Native→JS | (any) | `"title"` or `"content"` | Returns which editor region has focus. | `index.js` | ✅ Yes |
| `callGetSelectionCoordsAndHasMarks` | Native→JS | (any) | `{ rect: DOMRect, marks: object }` | Returns selection bounding rect + active marks map. | `index.js` | ✅ Yes |
| `callGetHasLinkCard` | Native→JS | (any) | boolean | Whether the note contains any link cards. | `index.js` | ✅ Yes |
| `callGetNodeRectByCoordsFromJava` | Native→JS | `{ x: number, y: number }` | DOMRect JSON | Returns bounding rect of node at given coordinates. | `index.js` | ✅ Yes |
| `callGetNodeRectBySrcFromJava` | Native→JS | src string | DOMRect JSON | Returns bounding rect of media node by `src` attribute. | `index.js` | ✅ Yes |
| `callGetImageRectByAttachIdFromJava` | Native→JS | attachId string | DOMRect JSON | Returns image bounding rect by `attachId`. | `index.js` | ✅ Yes |
| `callGetPaintAttachmentFromJava` | Native→JS | (attachId or any) | attachment data JSON | Returns paint block attachment data. | `index.js` | ⚠️ Requires paint node support |
| `callGetPaintDisplayDimensionsFromJava` | Native→JS | (any) | `{ width: number, height: number }` | Returns paint canvas display dimensions. | `index.js` | ⚠️ Requires paint node support |
| `callGetPaintBackgroundFromJava` | Native→JS | (any) | background type string | Returns paint block background type. | `index.js` | ⚠️ Requires paint node support |
| `callGetSelectedBlockFromJava` | Native→JS | (any) | block info JSON | Returns info on the currently selected block. | `index.js` | ✅ Yes |
| `callGetSelectedPaintAttachIdsFromJava` | Native→JS | (any) | JSON array of IDs | Returns `attachId`s of all selected paint blocks. | `index.js` | ⚠️ Requires paint node support |
| `callGetSelectedPaintBackgroundTypesFromJava` | Native→JS | (any) | JSON array of types | Returns background types of selected paint blocks. | `index.js` | ⚠️ Requires paint node support |
| `callGetRecordCardRectFromJava` | Native→JS | (any) | DOMRect JSON | Returns bounding rect of record/audio card. | `index.js` | ⚠️ Requires record node support |
| `callGetRecordDetailRectFromJava` | Native→JS | (any) | DOMRect JSON | Returns bounding rect of record detail area. | `index.js` | ⚠️ Requires record node support |
| `callGetTableFullDisplayWidthFromJava` | Native→JS | (any) | number (px) | Returns the full rendered width of the table. | `index.js` | ✅ Yes |
| `callPastAttachEndFromJava` | Native→JS | (any) | (not specified) | Signals that a paste-attach sequence has ended. Also registered as `callGetPastAttachEndFromJava`. | `index.js` | ✅ Yes — no-op or fire event |

---

### 2.3 Text Formatting (Inline Marks)

| Handler Name | Direction | Input Parameters | Callback Response | Purpose | Native Implementation | Independently Implementable? |
|---|---|---|---|---|---|---|
| `callSetBoldFromJava` | Native→JS | JSON string (mark options) | `"done"` | Applies/toggles bold mark. Uses `lM(editor, JSON.parse(data))`. | `index.js` (`lM()`) | ✅ Yes |
| `callSetItalicFromJava` | Native→JS | JSON string (mark options) | `"done"` | Applies/toggles italic mark. Uses `aM(editor, JSON.parse(data))`. | `index.js` (`aM()`) | ✅ Yes |
| `callSetUnderlineFromJava` | Native→JS | JSON string: `{ color: string, style: string }` | `"done"` | Applies underline with color/style. Uses `Ju(editor, color, style)`. | `index.js` (`Ju()`) | ✅ Yes |
| `callSetStrikethroughFromJava` | Native→JS | JSON string (mark options) | `"done"` | Applies/toggles strikethrough. Uses `uM(editor, JSON.parse(data))`. | `index.js` (`uM()`) | ✅ Yes |
| `callSetTextColorFromJava` | Native→JS | color string (e.g. `"#FF0000"`) | `"done"` | Sets foreground text color. Uses `cM(editor, data)`. | `index.js` (`cM()`) | ✅ Yes |
| `callSetTextHighlightFromJava` | Native→JS | JSON string (highlight options) | `"done"` | Sets text highlight/background color. Uses `_b(editor, JSON.parse(data))`. | `index.js` (`_b()`) | ✅ Yes |
| `callSetBackgroundColorFromJava` | Native→JS | color string | `"done"` | Sets block background color. Uses `dM(editor, data)`. | `index.js` (`dM()`) | ✅ Yes |
| `callSetFontSizeFromJava` | Native→JS | string (parsed via `parseInt`) | (no explicit callback) | Sets font size. Uses `Ib(editor, size)`. | `index.js` (`Ib()`) | ✅ Yes |
| `callSetFontFamilyFromJava` | Native→JS | font family name string | (not specified) | Sets font family for selection. | `index.js` | ✅ Yes |
| `callSetTextAlignFromJava` | Native→JS | `"start"` \| `"center"` \| `"end"` | (not specified) | Sets text alignment for current block. | `index.js` | ✅ Yes |

---

### 2.4 Block / Paragraph Formatting

| Handler Name | Direction | Input Parameters | Callback Response | Purpose | Native Implementation | Independently Implementable? |
|---|---|---|---|---|---|---|
| `callSetTitleStyleFromJava` | Native→JS | heading level (string/number) | (not specified) | Sets heading level (H1–H6 or paragraph). | `index.js` | ✅ Yes |
| `callSetBlockQuoteFromJava` | Native→JS | (any) | (not specified) | Toggles blockquote on current block. | `index.js` | ✅ Yes |
| `callIncreaseIndentFromJava` | Native→JS | (any) | (not specified) | Increases indentation level. | `index.js` | ✅ Yes |
| `callDecreaseIndentFromJava` | Native→JS | (any) | (not specified) | Decreases indentation level. | `index.js` | ✅ Yes |
| `callSetContentStyleFromJava` | Native→JS | style JSON | (not specified) | Applies content-wide style properties. | `index.js` | ✅ Yes |
| `callAddHorizontalRuleFromJava` | Native→JS | (any) | (not specified) | Inserts a horizontal rule/divider at cursor. | `index.js` | ✅ Yes |
| `callUpdateHorizontalRuleFromJava` | Native→JS | attributes JSON | (not specified) | Updates attributes of existing horizontal rule. | `index.js` | ✅ Yes |

---

### 2.5 List Operations

| Handler Name | Direction | Input Parameters | Callback Response | Purpose | Native Implementation | Independently Implementable? |
|---|---|---|---|---|---|---|
| `callToggleBulletListFromJava` | Native→JS | `{ query?: string }` | `"done"` | Toggles unordered/bullet list. Calls `editor.commands.toggleBulletList()`. | `index.js` | ✅ Yes |
| `callToggleBulletListHXFromJava` | Native→JS | (any) | `"done"` | Toggles heading-style bullet list variant. | `index.js` | ✅ Yes |
| `callToggleOrderedListFromJava` | Native→JS | (any) | `"done"` | Toggles ordered/numbered list. | `index.js` | ✅ Yes |
| `callToggleTaskListFromJava` | Native→JS | `{ query?: string }` | `"done"` | Toggles task list (checklist) on current block. | `index.js` | ✅ Yes |

---

### 2.6 Undo / Redo / History

| Handler Name | Direction | Input Parameters | Callback Response | Purpose | Native Implementation | Independently Implementable? |
|---|---|---|---|---|---|---|
| `callUndoFromJava` | Native→JS | (any) | `"done"` | Undo last action. If IME is visible: hides caret, schedules `customUndo()`, then calls `updateNativeMarksStatus()`. | `index.js` (`customUndo()`) | ✅ Yes |
| `callRedoFromJava` | Native→JS | (any) | `"done"` | Redo last undone action. Calls `customRedo()`. | `index.js` (`customRedo()`) | ✅ Yes |
| `callRollBackSpecifiedTimesFromJava` | Native→JS | number (count) | (not specified) | Undo N times in sequence. | `index.js` | ✅ Yes |

---

### 2.7 Search

| Handler Name | Direction | Input Parameters | Callback Response | Purpose | Native Implementation | Independently Implementable? |
|---|---|---|---|---|---|---|
| `callSearchFromJava` | Native→JS | query string | `"done"` | Initiates search and highlights matches. Uses `Mb(editor, data)`. | `index.js` (`Mb()`) | ✅ Yes |
| `callMatchPreviousFromJava` | Native→JS | (any) | `"done"` | Navigates to previous search match. Uses `FM(editor)`. | `index.js` (`FM()`) | ✅ Yes |
| `callMatchNextFromJava` | Native→JS | (any) | `"done"` | Navigates to next search match. Uses `WM(editor)`. | `index.js` (`WM()`) | ✅ Yes |
| `callClearSearchResultFromJava` | Native→JS | (any) | `"done"` | Clears all search highlights. Uses `Rb(editor)`. | `index.js` (`Rb()`) | ✅ Yes |
| `resetQueryFromJava` | Native→JS | (any) | (not specified) | Resets the search query state. | `index.js` | ✅ Yes |

---

### 2.8 Image & Media

| Handler Name | Direction | Input Parameters | Callback Response | Purpose | Native Implementation | Independently Implementable? |
|---|---|---|---|---|---|---|
| `callInsertImageFromJava` | Native→JS | image data JSON | `"done"` | Inserts image node at cursor. Uses `wb(editor, data)`. | `index.js` (`wb()`) | ✅ Yes |
| `callUpdateImageFromJava` | Native→JS | image attributes JSON | `"done"` | Updates attributes of existing image node. Uses `RP(editor, data)`. | `index.js` (`RP()`) | ✅ Yes |
| `callReplaceNodeByImageFromJava` | Native→JS | `{ attachId, src, ... }` | (not specified) | Replaces a placeholder node with a fully-loaded image. | `index.js` | ✅ Yes |
| `callSwitchImageSizeFromJava` | Native→JS | size mode string | (not specified) | Toggles between full-width and inline image size modes. | `index.js` | ✅ Yes |
| `callEnableImageAnimationFromJava` | Native→JS | (attachId or boolean) | (not specified) | Enables animated GIF playback for an image node. | `index.js` | ✅ Yes |
| `callSetImageShareNoticeFromJava` | Native→JS | notice data | (not specified) | Sets sharing notice/watermark on an image. | `index.js` | ⚠️ Partial — display only |
| `callInsertVideoPlaceHolderFromJava` | Native→JS | placeholder data JSON | (not specified) | Inserts a video placeholder node (before upload completes). | `index.js` | ✅ Yes |
| `callReplaceNodeByVideoFromJava` | Native→JS | video data JSON | (not specified) | Replaces placeholder with a fully-loaded video node. | `index.js` | ✅ Yes |
| `callUpdateVideoFromJava` | Native→JS | video attributes JSON | (not specified) | Updates metadata/attributes of a video node. | `index.js` | ✅ Yes |
| `callScrollToAttachmentFromJava` | Native→JS | attachId string | (not specified) | Scrolls the editor to bring the specified attachment into view. | `index.js` | ✅ Yes |
| `callMoveAttachToSelectionFromJava` | Native→JS | attachId string | (not specified) | Moves an attachment node into the current selection position. | `index.js` | ✅ Yes |
| `callDeleteNodeByAttachIdFromJava` | Native→JS | attachId string | `"done"` | Deletes a node identified by its `attachId`. Uses `mM(editor, data)`. | `index.js` (`mM()`) | ✅ Yes |
| `callDeleteSelectedNodeFromJava` | Native→JS | (any) | (not specified) | Deletes the currently selected node. | `index.js` | ✅ Yes |
| `callUpdateElementAttributesFromJava` | Native→JS | `{ id, attrs }` JSON | (not specified) | Updates arbitrary attributes on a node by ID. | `index.js` | ✅ Yes |
| `callReplaceAttachmentByTextFromJava` | Native→JS | `{ attachId, text }` | (not specified) | Replaces an attachment node with a plain text node. | `index.js` | ✅ Yes |
| `callScrollIntoViewFromJava` | Native→JS | (node id / position) | (not specified) | Scrolls a node into the visible viewport. | `index.js` | ✅ Yes |

---

### 2.9 Audio / Record

| Handler Name | Direction | Input Parameters | Callback Response | Purpose | Native Implementation | Independently Implementable? |
|---|---|---|---|---|---|---|
| `callReplaceNodeByAudioFromJava` | Native→JS | audio/record data JSON | (not specified) | Replaces placeholder with an audio record node. | `index.js` | ⚠️ Requires record node support |
| `callUpdateRecordFromJava` | Native→JS | record metadata JSON | (not specified) | Updates metadata fields on a record card. | `index.js` | ⚠️ Requires record node support |
| `callUpdateRecordStateFromJava` | Native→JS | playback state JSON | (not specified) | Updates the playback state of a record card (playing/paused/stopped). | `index.js` | ⚠️ Requires record node support |
| `callUpdateRecordCallLogsFromJava` | Native→JS | call logs JSON array | (not specified) | Updates call log entries displayed within a record card. | `index.js` | ⚠️ Requires record node support |
| `callSetRecordCurrentTimeFromJava` | Native→JS | time (number, ms) | `"done"` | Sets the current playback seek position. | `index.js` | ⚠️ Requires record node support |
| `callRecordDisableFromJava` | Native→JS | boolean | (not specified) | Disables user interaction with record card (e.g., during upload). | `index.js` | ⚠️ Requires record node support |
| `callStartSpeechRecognizeFromJava` | Native→JS | (any) | (not specified) | Triggers speech-to-text recognition mode in the editor. | `index.js` | ❌ Requires Android STT backend |

---

### 2.10 Cards (Web / Contact / Schedule / File)

| Handler Name | Direction | Input Parameters | Callback Response | Purpose | Native Implementation | Independently Implementable? |
|---|---|---|---|---|---|---|
| `callInsertCardFromJava` | Native→JS | card data JSON | `"done"` | Inserts a link/web card node. Uses `bM(editor, data)`. | `index.js` (`bM()`) | ✅ Yes |
| `callInsertContactCardFromJava` | Native→JS | contact data JSON | `"done"` | Inserts a contact card node. Uses `vM(editor, data)`. | `index.js` (`vM()`) | ✅ Yes |
| `callInsertScheduleCardFromJava` | Native→JS | schedule data JSON | `"done"` | Inserts a calendar/schedule card node. Uses `yM(editor, data)`. | `index.js` (`yM()`) | ✅ Yes |
| `callInsertRecordCardFromJava` | Native→JS | record data JSON | `"done"` | Inserts an audio record card. Uses `SM(editor, data)`. | `index.js` (`SM()`) | ⚠️ Requires record node |
| `callInsertFileCardFromJava` | Native→JS | file data JSON | `"done"` | Inserts a file/document card. Uses `CM(editor, data)`. | `index.js` (`CM()`) | ✅ Yes |
| `callUpdateCardFromJava` | Native→JS | card update JSON | (not specified) | Updates card content after URL fetch completes. | `index.js` | ✅ Yes |
| `callUpdateCardInfoFromJava` | Native→JS | card metadata JSON | (not specified) | Updates card metadata (title, thumbnail, etc.). | `index.js` | ✅ Yes |
| `callReplaceNodeByCardFromJava` | Native→JS | `{ attachId, cardData }` | (not specified) | Replaces a placeholder node with a card. | `index.js` | ✅ Yes |
| `callReplaceNodeByDocumentFromJava` | Native→JS | document data JSON | (not specified) | Replaces a placeholder node with a document card. | `index.js` | ✅ Yes |
| `callUpdateFileDocThumbnailFromJava` | Native→JS | `{ attachId, thumbnailSrc }` | `"done"` | Updates a file card's thumbnail image. | `index.js` | ✅ Yes |
| `callUpdateFileNameFromJava` | Native→JS | `{ attachId, fileName }` | `"done"` | Updates a file card's displayed filename. | `index.js` | ✅ Yes |
| `callConvertToLinkFromJava` | Native→JS | `{ href, text }` JSON | `"done"` | Converts selected text to a hyperlink. Uses `NP(editor, data)`. | `index.js` (`NP()`) | ✅ Yes |
| `callConvertToLinkByBlockFromJava` | Native→JS | block data JSON | JSON response | Converts a block-level selection to a link. | `index.js` | ✅ Yes |
| `callConvertToCardByBlockFromJava` | Native→JS | block selection JSON | `"done"` | Converts a block selection into a card node. | `index.js` | ✅ Yes |
| `callConvertToCardFromJava` | Native→JS | `{ href, ... }` | (not specified) | Converts an existing link mark into a card node. | `index.js` | ✅ Yes |

---

### 2.11 Paint (Drawing Canvas)

| Handler Name | Direction | Input Parameters | Callback Response | Purpose | Native Implementation | Independently Implementable? |
|---|---|---|---|---|---|---|
| `callInsertNewPaintFromJava` | Native→JS | paint init data JSON | (not specified) | Inserts a new blank paint/drawing block. | `index.js` | ⚠️ Requires paint node extension |
| `callInsertOrActivatePaintFromJava` | Native→JS | paint data JSON | (not specified) | Inserts a paint block or activates editing on existing one. | `index.js` | ⚠️ Requires paint node extension |
| `callDeleteNewPaintFromJava` | Native→JS | attachId string | (not specified) | Deletes a paint block by `attachId`. | `index.js` | ⚠️ Requires paint node extension |
| `callUpdateNewPaintFromJava` | Native→JS | paint attributes JSON | (not specified) | Updates paint block node attributes (e.g., image src, dimensions). | `index.js` | ⚠️ Requires paint node extension |
| `callReplaceNodeByPaintFromJava` | Native→JS | `{ attachId, paintData }` | (not specified) | Replaces a node with a paint node. | `index.js` | ⚠️ Requires paint node extension |
| `callActiveTargetPaintFromJava` | Native→JS | paintId string | (not specified) | Activates paint editing mode for a specific target paint block. | `index.js` | ⚠️ Requires paint node extension |
| `callUpdateTargetPaintEditingFromJava` | Native→JS | editing state JSON | (not specified) | Updates the editing state of a target paint block. | `index.js` | ⚠️ Requires paint node extension |
| `callSplitPaintFromJava` | Native→JS | split data JSON | (not specified) | Splits a paint block at a given position. | `index.js` | ⚠️ Requires paint node extension |
| `callUpdateSelectedPaintBackgroundFromJava` | Native→JS | background type string | (not specified) | Changes the background type of selected paint block(s). | `index.js` | ⚠️ Requires paint node extension |
| `callIsPaintUnderTargetNodeFromJava` | Native→JS | target node data | boolean | Checks whether a paint block is positioned under a given target node. | `index.js` | ⚠️ Requires paint node extension |
| `callPaintIsScalingFromJava` | Native→JS | boolean | (not specified) | Notifies editor that a paint block is currently being scaled by the user. | `index.js` | ⚠️ Requires paint node extension |

---

### 2.12 Table Operations

| Handler Name | Direction | Input Parameters | Callback Response | Purpose | Native Implementation | Independently Implementable? |
|---|---|---|---|---|---|---|
| `callInsertTableFromJava` | Native→JS | `{ rows, cols }` JSON | (not specified) | Inserts a new table with given dimensions. | `index.js` | ✅ Yes (TipTap table ext.) |
| `callAddRowInTableFromJava` | Native→JS | position/index JSON | (not specified) | Adds a row to the focused table. | `index.js` | ✅ Yes |
| `callRemoveRowInTableFromJava` | Native→JS | row index JSON | (not specified) | Removes a row from the focused table. | `index.js` | ✅ Yes |
| `callMoveRowInTableFromJava` | Native→JS | `{ from, to }` JSON | (not specified) | Moves a row to a new position. | `index.js` | ✅ Yes |
| `callAddColumnInTableFromJava` | Native→JS | position/index JSON | (not specified) | Adds a column to the focused table. | `index.js` | ✅ Yes |
| `callRemoveColumnInTableFromJava` | Native→JS | column index JSON | (not specified) | Removes a column from the focused table. | `index.js` | ✅ Yes |
| `callMoveColumnInTableFromJava` | Native→JS | `{ from, to }` JSON | (not specified) | Moves a column to a new position. | `index.js` | ✅ Yes |
| `callSetTableColorFromJava` | Native→JS | color string | (not specified) | Sets the header row color of the focused table. | `index.js` | ✅ Yes |
| `callShareTableToPictureFromJava` | Native→JS | (any) | (image data / null) | Captures the table as an image for sharing. | `index.js` + html2canvas | ❌ Requires capture pipeline |
| `callOnTableMenuDismissFromJava` | Native→JS | (any) | (not specified) | Notifies editor that the native table context menu was dismissed. | `index.js` | ✅ Yes — no-op |
| `callOnTableSelectMenuDismissFromJava` | Native→JS | (any) | (not specified) | Notifies editor that the native table select menu was dismissed. | `index.js` | ✅ Yes — no-op |

---

### 2.13 Selection & Clipboard

| Handler Name | Direction | Input Parameters | Callback Response | Purpose | Native Implementation | Independently Implementable? |
|---|---|---|---|---|---|---|
| `callSetTextSelectionFromJava` | Native→JS | `{ from, to }` JSON | (not specified) | Sets the editor selection to a specific character range. | `index.js` | ✅ Yes |
| `callSetTextSelectionAllFromJava` | Native→JS | (any) | (not specified) | Selects all text in the editor. | `index.js` | ✅ Yes |
| `callCancelTextSelectionAllFromJava` | Native→JS | (any) | (not specified) | Collapses/deselects all selected text. | `index.js` | ✅ Yes |
| `callToggleSelectionAllFromJava` | Native→JS | (any) | (not specified) | Toggles between select-all and deselect. | `index.js` | ✅ Yes |
| `callSelectRangeTextAIGCFromJava` | Native→JS | `{ from, to }` JSON | (not specified) | Sets a text selection range specifically for AIGC operations. | `index.js` | ⚠️ Partial |
| `callCopyInEditorFromJava` | Native→JS | (any) | (not specified) | Triggers a copy operation programmatically. | `index.js` | ✅ Yes |
| `callCutInEditorFromJava` | Native→JS | (any) | (not specified) | Triggers a cut operation programmatically. | `index.js` | ✅ Yes |
| `callPasteInEditorFromJava` | Native→JS | (any) | (not specified) | Triggers a paste operation programmatically. | `index.js` | ✅ Yes |

---

### 2.14 Block Selection / Drag & Drop

| Handler Name | Direction | Input Parameters | Callback Response | Purpose | Native Implementation | Independently Implementable? |
|---|---|---|---|---|---|---|
| `callExitBlockSelectionModeFromJava` | Native→JS | (any) | (not specified) | Exits block (multi-select) mode. | `index.js` | ✅ Yes |
| `callDelBlockSelectionModeFromJava` | Native→JS | (any) | (not specified) | Deletes selected blocks in block selection mode. | `index.js` | ✅ Yes |
| `callShareBlockSelectionModeFromJava` | Native→JS | (any) | (not specified) | Initiates sharing of selected blocks. | `index.js` | ⚠️ Requires native share sheet |
| `callOnGlobalBlockPasteFromJava` | Native→JS | paste data JSON | (not specified) | Handles a block paste from a drag-and-drop operation. | `index.js` | ✅ Yes |
| `callOnGlobalDragStartFromJava` | Native→JS | `{ type, x, y, ... }` JSON | (not specified) | Notifies editor that a global drag has started. | `index.js` | ✅ Yes |
| `callOnGlobalDragEndFromJava` | Native→JS | (any) | (not specified) | Notifies editor that the drag gesture has ended. | `index.js` | ✅ Yes |
| `callOnGlobalDragEnterFromJava` | Native→JS | `{ x, y, ... }` JSON | (not specified) | Notifies editor that a drag has entered its bounds. | `index.js` | ✅ Yes |
| `callOnGlobalDragLocationFromJava` | Native→JS | `{ x, y }` JSON | (not specified) | Updates drag cursor position while dragging over editor. | `index.js` | ✅ Yes |
| `callOnGlobalDragDropFromJava` | Native→JS | `"true"` or `"false"` | (not specified) | Notifies editor of drop event (accepted or rejected). | `index.js` | ✅ Yes |
| `callOnGlobalDragOtherPasteEndFromJava` | Native→JS | (any) | (not specified) | Signals end of a non-block drag-paste sequence. | `index.js` | ✅ Yes |
| `callHandleViewHandStateChange` | Native→JS | hand state JSON | (not specified) | Handles Apple Pencil / stylus hand-state change event. | `index.js` | ⚠️ Stylus-specific |

---

### 2.15 Display & Layout

| Handler Name | Direction | Input Parameters | Callback Response | Purpose | Native Implementation | Independently Implementable? |
|---|---|---|---|---|---|---|
| `callSetUiModeFromJava` | Native→JS | `"edit"` \| `"view"` \| `"overlay"` | (not specified) | Sets the editor UI mode. | `index.js` | ✅ Yes |
| `callSetDensityScaleFromJava` | Native→JS | number (scale factor) | (not specified) | Sets the screen density/pixel ratio scale. | `index.js` | ✅ Yes |
| `callSetEditorScaleFromJava` | Native→JS | number (scale) | (not specified) | Scales the editor canvas. | `index.js` | ✅ Yes |
| `callSetTransformFromJava` | Native→JS | CSS transform string | (not specified) | Applies a CSS transform to the editor root. | `index.js` | ✅ Yes |
| `callChangeWebViewWidthScaleFromJava` | Native→JS | scale number | `"done"` | Changes WebView width scale; sets `overflow-x: hidden`. | `index.js` | ✅ Yes |
| `callSetBasicCssParamsFromJava` | Native→JS | CSS variables JSON | (not specified) | Sets base CSS custom properties (spacing, sizes, etc.). | `index.js` | ✅ Yes |
| `callSetSkinCssParamsFromJava` | Native→JS | CSS variables JSON | (not specified) | Sets skin/theme CSS custom properties (colors, fonts). | `index.js` | ✅ Yes |
| `callSetPanelHeightFromJava` | Native→JS | height (px) | (not specified) | Sets the bottom panel (keyboard/toolbar) height. | `index.js` | ✅ Yes |
| `callUpdateContentHeightFromJava` | Native→JS | height (px) | `"done"` | Updates the maximum content height constraint. | `index.js` | ✅ Yes |
| `callUpdateTimeBarHeightFromJava` | Native→JS | height (px) | (not specified) | Updates the height of the time bar overlay. | `index.js` | ✅ Yes |
| `callSetUserScrollFromJava` | Native→JS | boolean | (not specified) | Enables or disables user-initiated scrolling. | `index.js` | ✅ Yes |
| `callScrollToBottomFromJava` | Native→JS | (any) | (not specified) | Programmatically scrolls the editor to the bottom. | `index.js` | ✅ Yes |
| `callLoadFontListFromJava` | Native→JS | font list JSON | (not specified) | Registers custom font faces for editor use. | `index.js` | ✅ Yes — stub with system fonts |
| `callFocusFromJava` | Native→JS | position (or null) | (not specified) | Focuses the editor at a given position. | `index.js` | ✅ Yes |
| `callClearFocusFromJava` | Native→JS | (any) | (not specified) | Removes focus from the editor. | `index.js` | ✅ Yes |
| `callSetKeyBoardEventFromJava` | Native→JS | key event JSON | (not specified) | Injects keyboard events from the Android layer. | `index.js` | ⚠️ Partial — browser keyboard handles most |
| `callDisableDocumentEventFromJava` | Native→JS | boolean | (not specified) | Enables/disables native document event propagation. | `index.js` | ✅ Yes — no-op |
| `callEditorInterceptClickFromJava` | Native→JS | (any) | (not specified) | Tells editor to intercept the next user click event. | `index.js` | ✅ Yes |

---

### 2.16 Capture & Share

| Handler Name | Direction | Input Parameters | Callback Response | Purpose | Native Implementation | Independently Implementable? |
|---|---|---|---|---|---|---|
| `callCaptureElementFromJava` | Native→JS | element selector / config JSON | base64 image data | Captures a DOM element as an image using `html2canvas`. | `index.js` + html2canvas | ✅ Yes (html2canvas bundled) |

---

### 2.17 AIGC / AI Features

| Handler Name | Direction | Input Parameters | Callback Response | Purpose | Native Implementation | Independently Implementable? |
|---|---|---|---|---|---|---|
| `callOnAIGCRewriteStartFromJava` | Native→JS | AIGC session data | (not specified) | Starts an AI rewrite session. | `index.js` | ❌ Requires AIGC backend |
| `callOnAIGCRewriteInsertFromJava` | Native→JS | insert chunk JSON | (not specified) | Streams an AI-generated insert chunk into the editor. | `index.js` | ❌ Requires AIGC backend |
| `callOnAIGCRewriteReplaceFromJava` | Native→JS | replacement JSON | (not specified) | Applies a full AI rewrite replacement. | `index.js` | ❌ Requires AIGC backend |
| `callOnAIGCRewriteDeleteFromJava` | Native→JS | delete range JSON | (not specified) | Applies an AI-instructed deletion. | `index.js` | ❌ Requires AIGC backend |
| `callOnAIGCRewriteResultFromJava` | Native→JS | result JSON | (not specified) | Delivers the final AI rewrite result. | `index.js` | ❌ Requires AIGC backend |
| `callOnAIGCRewriteFinishFromJava` | Native→JS | (any) | (not specified) | Signals AI rewrite session complete. | `index.js` | ❌ Requires AIGC backend |
| `callOnAIGCSelectAllTextFromJava` | Native→JS | (any) | (not specified) | Selects all text for AIGC context. | `index.js` | ⚠️ Partial |
| `callOnAIGCTableInsertFromJava` | Native→JS | table data JSON | (not specified) | Inserts an AI-generated table. | `index.js` | ❌ Requires AIGC backend |
| `callOnGetAIGCHTMLContentFromJava` | Native→JS | (any) | HTML string | Returns HTML content for AIGC processing. | `index.js` | ⚠️ Partial |
| `callOnAIKITUpdateCacheInfoFromJava` | Native→JS | cache info JSON | (not specified) | Updates AiKit cached response info. | `index.js` | ❌ Requires AiKit backend |
| `callOnAIKITUpperScreenScrollDataFromJava` | Native→JS | scroll data JSON | (not specified) | Provides scroll context data to AiKit. | `index.js` | ❌ Requires AiKit backend |
| `callOnActionItemClickedBeforeFromJava` | Native→JS | action item JSON | (not specified) | Pre-click hook for AIGC action items. | `index.js` | ❌ Requires AIGC backend |
| `callOnActionItemClickedAfterFromJava` | Native→JS | action item JSON | (not specified) | Post-click hook for AIGC action items. | `index.js` | ❌ Requires AIGC backend |
| `callOnAiKitRewriteInsertFromJava` | Native→JS | insert chunk JSON | (not specified) | AiKit streaming insert. | `index.js` | ❌ Requires AiKit backend |
| `callOnAiKitRewriteReplaceFromJava` | Native→JS | replacement JSON | (not specified) | AiKit streaming replace. | `index.js` | ❌ Requires AiKit backend |
| `callInsertSummaryStreamTipFromJava` | Native→JS | summary data JSON | (not specified) | Inserts an AI summary stream tip node. | `index.js` | ❌ Requires summary backend |
| `callUpdateSummaryStreamTipFromJava` | Native→JS | update JSON | (not specified) | Updates the streaming summary tip content. | `index.js` | ❌ Requires summary backend |
| `callDeleteSummaryStreamTipFromJava` | Native→JS | (any) | (not specified) | Removes the summary stream tip node. | `index.js` | ❌ Requires summary backend |
| `callSetSummaryEntityFromJava` | Native→JS | entity JSON | (not specified) | Sets the AI summary entity object. | `index.js` | ❌ Requires summary backend |
| `callSetSummaryContentWithAnimation` | Native→JS | content JSON | (not specified) | Sets final summary content with animated reveal. | `index.js` | ❌ Requires summary backend |
| `callSetAiSummaryStartStop` | Native→JS | boolean | (not specified) | Starts or stops AI summary generation. | `index.js` | ❌ Requires summary backend |
| `callAddQuickInputSlashFromJava` | Native→JS | slash command data JSON | (not specified) | Triggers a quick-input slash command action. | `index.js` | ⚠️ Partial — depends on slash menu |
| `callResetQuickInputFormatFromJava` | Native→JS | (any) | (not specified) | Resets the quick input slash formatting state. | `index.js` | ✅ Yes |

---

### 2.18 Miscellaneous

| Handler Name | Direction | Input Parameters | Callback Response | Purpose | Native Implementation | Independently Implementable? |
|---|---|---|---|---|---|---|
| `_hasJavascriptMethod` | Native→JS | handler name string | `true` / `false` | Introspection: checks whether a named JS handler is registered. | `index.js` | ✅ Yes |

---

## 3. JS → Native Calls (`injectedObject`)

> JS calls these methods synchronously on `window.injectedObject`, a Java object annotated with `@JavascriptInterface`. Return values (where applicable) are returned synchronously to JS.

### 3.1 Logging

| Method | Parameters | Return | Purpose | Independently Implementable? |
|---|---|---|---|---|
| `onJsLogPrint` | `level: "d"|"i"|"e"`, `tag: string`, `msg: string` | void | Routes JS log output to Android logcat. Called by internal log helpers `j()` (debug), `De()` (info), `un()` (error). [VERIFIED] | ✅ Yes — stub to `console.log` |
| `onHandleJsUncaughtException` | `errorJson: string` | void | Reports uncaught JS exceptions to Android crash reporting. [VERIFIED] | ✅ Yes — stub to `console.error` |

---

### 3.2 Lifecycle

| Method | Parameters | Return | Purpose | Independently Implementable? |
|---|---|---|---|---|
| `onTipTapMounted` | (none) | void | Signals Android that the TipTap editor component is fully mounted and ready. [VERIFIED] | ✅ Yes — no-op stub |
| `injectedAppVueObject.onAppVueMounted` | (none) | `{ colorOSVersion: number }` | Called on `App.vue` mount. Returns ColorOS version to the JS layer. Registered on a **separate** `injectedAppVueObject`, not `injectedObject`. [VERIFIED] | ✅ Yes — return mock `{ colorOSVersion: 14 }` |

---

### 3.3 Content Updates

| Method | Parameters | Return | Purpose | Independently Implementable? |
|---|---|---|---|---|
| `onContentJsonUpdate` | `json: string` | void | Sends the full TipTap document JSON to Android on every edit. Called with 50ms debounce, 100ms max wait. [VERIFIED] | ✅ Yes — no-op or persist locally |
| `onTitleChange` | `title: string` | void | Notifies Android of title text change. [VERIFIED] | ✅ Yes — no-op |
| `onTitleJsonUpdate` | `json: string` | void | Sends the title editor's TipTap JSON on update. [VERIFIED] | ✅ Yes — no-op |
| `onTitleFocus` | `focused: boolean` | void | Reports title editor focus state to Android. [VERIFIED] | ✅ Yes — no-op |
| `onTitleHeightChange` | `height: number` | void | Reports title area height change (for Android layout adjustment). [VERIFIED] | ✅ Yes — no-op |
| `onContentFocus` | `focused: boolean` | void | Reports content editor focus state. [VERIFIED] | ✅ Yes — no-op |
| `onContentCountChange` | `chars: number`, `words: number` | void | Reports character and word count on change. [VERIFIED] | ✅ Yes — no-op |
| `onContentLineHeightChange` | `height: number` | void | Reports current line height change. [VERIFIED] | ✅ Yes — no-op |
| `onContentHasTable` | `hasTable: boolean` | void | Reports whether the document now contains a table. [VERIFIED] | ✅ Yes — no-op |
| `onHorizontalCountChange` | `count: number` | void | Reports the count of horizontally-scrollable items (e.g., image rows). [VERIFIED] | ✅ Yes — no-op |

---

### 3.4 Selection & Marks

| Method | Parameters | Return | Purpose | Independently Implementable? |
|---|---|---|---|---|
| `isNodeOrMarkActive` | `z: boolean`, `nodeOrMarkName: string`, `z2: boolean`, `z3: boolean`, `z4: boolean`, `attrsMapJson: string`, `z5: boolean` | void | Reports to Android which marks/nodes are currently active at the cursor (used to update native toolbar state). [VERIFIED] | ✅ Yes — no-op |
| `onSelection` | `selectionJson: string` | void | Reports full selection state on change. [VERIFIED] | ✅ Yes — no-op |
| `showRichTextFormatMenu` | `propsJson: string` (`{ query: string, clientRect: DOMRect }`) | void | Asks Android to display the native slash-command menu. [VERIFIED] | ✅ Yes — show custom web UI instead |
| `removeSlashSymbol` | (none) | void | Tells Android (which mirrors it back) to remove the `/` trigger character after menu dismissal. [VERIFIED] | ✅ Yes — no-op |
| `onTextInput` | `text: string` | void | Reports text input event to Android. [VERIFIED] | ✅ Yes — no-op |
| `onTextAlignActive` | `active: boolean`, `align: string` | void | Reports current active text alignment to Android toolbar. [VERIFIED] | ✅ Yes — no-op |
| `onBulletListSymbolChange` | `symbol: string` | void | Reports bullet list symbol type change. [VERIFIED] | ✅ Yes — no-op |
| `redoAvailable` | `available: boolean` | void | Reports redo stack availability (for enabling/disabling native redo button). [VERIFIED] | ✅ Yes — no-op |
| `undoAvailable` | `available: boolean` | void | Reports undo stack availability. [VERIFIED] | ✅ Yes — no-op |

---

### 3.5 Interaction Events

| Method | Parameters | Return | Purpose | Independently Implementable? |
|---|---|---|---|---|
| `onLongClick` | `type: string`, `rect: string`, `outerHTML: string`, `attachId: string`, `attachUrl: string`, `i: number`, `x: float`, `y: float`, `z: boolean` | `boolean` | Long-press event. Return value indicates whether Android handled it. [VERIFIED] | ✅ Yes — return `false` (unhandled) |
| `onImageClick` | `src: string`, `str: string` | void | User tapped an image node. [VERIFIED] | ✅ Yes — open lightbox |
| `onImageDoubleClick` | `src: string` | void | User double-tapped an image node. [VERIFIED] | ✅ Yes — custom handler |
| `onVideoClick` | `src: string`, `duration: string`, `fileName: string` | void | User tapped a video node. [VERIFIED] | ✅ Yes — open player |
| `onLinkClick` | `href: string`, `i: number`, `i2: number`, `pos: string`, `i3: number` | void | User tapped a link. [VERIFIED] | ✅ Yes — `window.open(href)` |
| `onCardClick` | `url: string` | void | User tapped a card node. [VERIFIED] | ✅ Yes — `window.open(url)` |
| `onPaintClick` | `paintId: string`, `paintSrc: string`, `imageId: string`, `imageSrc: string` | void | User tapped a paint block. [VERIFIED] | ⚠️ Requires paint canvas |
| `onPaintTipsClick` | `paintId: string`, `paintSrc: string`, `imageId: string`, `imageSrc: string` | void | User tapped paint tips overlay. [VERIFIED] | ⚠️ Requires paint canvas |
| `onTaskClick` | `clicked: string` | void | User tapped a task list checkbox. [VERIFIED] | ✅ Yes — no-op |
| `onClickEditorOutside` | `z: boolean` | void | User tapped outside the editor bounds. [VERIFIED] | ✅ Yes — no-op |
| `onInterceptWebEditorClickCall` | (none) | void | Intercepts click for custom native handling. [VERIFIED] | ✅ Yes — no-op |
| `onCopyViewClick` | `text: string` | void | User tapped a copy-view widget. [VERIFIED] | ✅ Yes — `navigator.clipboard.writeText(text)` |
| `lastEmptyTextClick` | `pos: string`, `i: number` | void | User tapped the empty area at the very end of text content. [VERIFIED] | ✅ Yes — no-op |
| `onTextClick` | `pos: string`, `i: number`, `selectionInfoJson?: string` | void | User tapped within the text area. [VERIFIED] | ✅ Yes — no-op |
| `onTextDragStart` | (none) | void | User started dragging text selection. [VERIFIED] | ✅ Yes — no-op |
| `onTextDragEnd` | (none) | void | User ended text drag. [VERIFIED] | ✅ Yes — no-op |
| `onNodeAdded` | `name: string`, `attrs: string` | void | A node was added to the document. [VERIFIED] | ✅ Yes — no-op |
| `onNodeDeleted` | `name: string`, `str: string` | void | A node was removed from the document. [VERIFIED] | ✅ Yes — no-op |

---

### 3.6 Scroll

| Method | Parameters | Return | Purpose | Independently Implementable? |
|---|---|---|---|---|
| `onRequestDisallowInterceptTouchEvent` | `disallow: boolean` | void | Requests Android to allow or block its own scroll interception (so JS scroll takes priority). [VERIFIED] | ✅ Yes — no-op |
| `setOverScrollEnable` | `enabled: boolean` | void | Enables or disables Android over-scroll (bounce/glow). [VERIFIED] | ✅ Yes — no-op |
| `scrollend` | (none) | void | Notifies Android that the editor scroll has ended. [VERIFIED] | ✅ Yes — no-op |
| `isOverScrolling` | (none) | `boolean` | Synchronously queries Android for over-scroll state. [VERIFIED] | ✅ Yes — return `false` |
| `inBlockHorizontalSliding` | `sliding: boolean` | void | Reports block horizontal slide state (e.g., horizontal image strip). [VERIFIED] | ✅ Yes — no-op |
| `isBlockHorizontalSlidingDisable` | (none) | `boolean` | Checks if horizontal block sliding is disabled. [VERIFIED] | ✅ Yes — return `false` |

---

### 3.7 Clipboard / Drag-Drop

| Method | Parameters | Return | Purpose | Independently Implementable? |
|---|---|---|---|---|
| `handlePaste` | `shiftKey: boolean` | `string \| null` | Handles paste; returns JSON clipboard data from Android clipboard, or `null` to fall back to browser paste. [VERIFIED] | ✅ Yes — return `null` (browser handles) |
| `handlePasteAttach` | `pasteAttachJson: string` | `string` | Handles attachment paste. Returns processed attach JSON. [VERIFIED] | ⚠️ Partial — stub with identity return |
| `handleAttachCopy` | `pastType: number`, `needCopyAttach: boolean` | void | Informs Android that an attachment was copied. [VERIFIED] | ✅ Yes — no-op |
| `handleCopyOrCut` | `isCut: boolean`, `hasAttach: boolean`, `plainText: string`, `html?: string` **OR** `z: boolean`, `z2: boolean`, `clipDataJson: string` | void | Notifies Android of copy/cut with clipboard contents. [VERIFIED] | ✅ Yes — use `navigator.clipboard` |
| `handleDrop` | `attachCount: number` | void | Notifies Android of a drop event with attachment count. [VERIFIED] | ✅ Yes — no-op |
| `startDragFromJs` | `type`, `attachId`, `attachUrl`, `i`, `rect`, `captureElementInfo`, `z`, `i2` | `boolean` | Starts a native Android drag operation from JS. Return value indicates whether drag was accepted. [VERIFIED] | ❌ Requires Android drag system |
| `startBlockDragFromJs` | `dragPosition: number`, `blockNumber: number`, `rect: string`, `clipDataInfo: string`, `captureElementInfo: string`, `z: boolean` | `boolean` | Starts a native block drag operation. [VERIFIED] | ❌ Requires Android drag system |

---

### 3.8 Paint-Specific

| Method | Parameters | Return | Purpose | Independently Implementable? |
|---|---|---|---|---|
| `exitOverlayModeFromJs` | `uiMode: string` | void | Exits paint overlay mode and restores the given UI mode. [VERIFIED] | ⚠️ Requires paint node support |
| `onEditingPaintRectChanged` | `str: string` | void | Notifies Android that the paint editing rect has changed. [VERIFIED] | ⚠️ Requires paint node support |
| `onEditingPaintUpdated` | `str: string` | void | Notifies Android that paint content was updated. [VERIFIED] | ⚠️ Requires paint node support |
| `onNewPaintEditing` | `str: string` | void | Notifies Android that a new paint edit session started. [VERIFIED] | ⚠️ Requires paint node support |
| `onDoodleUndoRedo` | `canUndo: boolean` | void | Reports doodle undo/redo availability state. [VERIFIED] | ⚠️ Requires paint node support |

---

### 3.9 Table

| Method | Parameters | Return | Purpose | Independently Implementable? |
|---|---|---|---|---|
| `onClickTableMenu` | `x: float`, `y: float`, `menuInfo: string` | void | Notifies Android to show native table context menu at given coords. [VERIFIED] | ✅ Yes — show custom web menu |
| `onShowTableSelectMenu` | `x: float`, `y: float`, `menuInfo: string` | void | Notifies Android to show table cell select menu. [VERIFIED] | ✅ Yes — show custom web menu |
| `onTableColorActive` | `active: boolean`, `color: string` | void | Reports active table color state. [VERIFIED] | ✅ Yes — no-op |
| `onTableCellContentOverflow` | (none) | void | Notifies Android that cell content overflows. [VERIFIED] | ✅ Yes — no-op |
| `onTableColumnsOverLimit` | (none) | void | Notifies Android that max column count was reached. [VERIFIED] | ✅ Yes — show web toast |
| `onTableRowsOverLimit` | (none) | void | Notifies Android that max row count was reached. [VERIFIED] | ✅ Yes — show web toast |
| `onTablesOverLimit` | (none) | void | Notifies Android that max table count was reached. [VERIFIED] | ✅ Yes — show web toast |
| `pastedUnsupportedDataInTable` | (none) | void | Notifies Android of unsupported paste inside a table. [VERIFIED] | ✅ Yes — show web toast |
| `isNewTblVersion` | (none) | `boolean` | Queries Android for table extension version. [VERIFIED] | ✅ Yes — return `true` |

---

### 3.10 Contact / Schedule Cards

| Method | Parameters | Return | Purpose | Independently Implementable? |
|---|---|---|---|---|
| `onContactCallClick` | `str: string` | void | User tapped call button on a contact card. [VERIFIED] | ❌ Requires Android telephony |
| `onContactSaveClick` | `name: string`, `phone: string`, `email: string`, `address: string` | void | User tapped save on a contact card. [VERIFIED] | ❌ Requires Android contacts API |
| `onScheduleAddClick` | `attrId: string` | void | User tapped add on a schedule card. [VERIFIED] | ❌ Requires Android calendar API |
| `onAddressNavigateClick` | `address: string` | void | User tapped navigate on an address. [VERIFIED] | ✅ Yes — open maps URL |

---

### 3.11 Audio / Record

| Method | Parameters | Return | Purpose | Independently Implementable? |
|---|---|---|---|---|
| `onAudioDetailClick` | `attachId: string`, `z: boolean` | void | User tapped audio detail expand. [VERIFIED] | ⚠️ Requires record node |
| `onRecordPlayClick` | `rect: string`, `z: boolean`, `attachId: string` | void | User tapped play on a record card. [VERIFIED] | ⚠️ Requires record node + audio backend |
| `onRecordStopTrackingTouch` | `i: number`, `picAttachId: string` | void | User released seek bar on record card. [VERIFIED] | ⚠️ Requires record node |
| `onWebAudioComponentLoaded` | `attachId: string` | void | Web audio component finished loading. [VERIFIED] | ⚠️ Requires record node |
| `onObserveRecordCardVisible` | `z: boolean`, `str: string` | void | Record card visibility changed. [VERIFIED] | ⚠️ Requires record node |

---

### 3.12 Document File

| Method | Parameters | Return | Purpose | Independently Implementable? |
|---|---|---|---|---|
| `onDocumentFileClick` | `path: string`, `fileName: string` | void | User tapped a file document card. [VERIFIED] | ✅ Yes — open download link |

---

### 3.13 System / Device

| Method | Parameters | Return | Purpose | Independently Implementable? |
|---|---|---|---|---|
| `isImeVisible` | (none) | `boolean` | Synchronously returns whether the soft keyboard is currently shown. [VERIFIED] | ✅ Yes — return `false` or use `visualViewport` |
| `hideSoftInput` | (none) | void | Hides the Android soft keyboard. [VERIFIED] | ✅ Yes — `document.activeElement.blur()` |
| `disableShowIme` | (none) | void | Prevents soft keyboard from appearing. [VERIFIED] | ✅ Yes — no-op |
| `checkIfHasPaint` | `hasPaint: boolean` | void | Reports whether the note has paint blocks. [VERIFIED] | ✅ Yes — no-op |
| `checkInCall` | (none) | `boolean` | Returns whether user is currently on a phone call. [VERIFIED] | ✅ Yes — return `false` |
| `pathExists` | `path: string` | `boolean` | Checks if a local Android file path exists. [VERIFIED] | ✅ Yes — return `false` |
| `findFirstPngFileWithPrefix` | `directory: string`, `prefix: string` | `string` | Finds first PNG file in a directory matching a prefix. [VERIFIED] | ✅ Yes — return `""` |
| `getAndroidString` | `strName: string` | `string` | Retrieves an Android string resource by name. [VERIFIED] | ✅ Yes — return `strName` or a mock map |
| `getAndroidVersion` | (none) | `number` | Returns the Android OS API version integer. [VERIFIED] | ✅ Yes — return `34` (Android 14) |
| `performVibrate` | (none) | void | Triggers Android haptic feedback. [VERIFIED] | ✅ Yes — `navigator.vibrate(50)` |
| `onPerformFeedback` | `i: number`, `i2: number`, `i3: number`, `z: boolean` | void | Reports haptic/feedback event. [VERIFIED] | ✅ Yes — no-op |

---

### 3.14 AIGC (AI)

| Method | Parameters | Return | Purpose | Independently Implementable? |
|---|---|---|---|---|
| `getAIGCCount` | `i: number` | `string` | Returns AIGC feature usage count. [VERIFIED] | ✅ Yes — return `"0"` |
| `getAigcGenerateBarHeight` | (none) | `number` | Returns height of AIGC generate bar (for layout). [VERIFIED] | ✅ Yes — return `0` |
| `onAigcShareClick` | `rect: string` | void | User clicked AIGC share button. [VERIFIED] | ❌ Requires AIGC share flow |
| `getUrlTitle` | `cardList: string`, `i: number` | void | Requests Android to fetch page title(s) for URLs. [VERIFIED] | ✅ Yes — fetch titles client-side |
| `onAiKitCopyClick` | `html: string` | void | User clicked AiKit copy. [VERIFIED] | ✅ Yes — `navigator.clipboard.write(html)` |
| `onAiKitGetCacheData` | `z: boolean`, `i: number` | `string` | Gets AiKit cached response data. [VERIFIED] | ✅ Yes — return `""` |
| `onAiKitRenderStarted` | (none) | void | AiKit rendering started. [VERIFIED] | ✅ Yes — no-op |
| `onAiKitRetryClick` | (none) | void | AiKit retry button clicked. [VERIFIED] | ❌ Requires AiKit backend |
| `onSummaryCancelClick` | (none) | void | AI summary cancelled by user. [VERIFIED] | ❌ Requires summary backend |
| `onSummaryRetryClick` | (none) | void | AI summary retry clicked. [VERIFIED] | ❌ Requires summary backend |
| `onSummaryStopClick` | (none) | void | AI summary stopped by user. [VERIFIED] | ❌ Requires summary backend |

---

### 3.15 Block Operations

| Method | Parameters | Return | Purpose | Independently Implementable? |
|---|---|---|---|---|
| `onBlockOperationsUpdated` | `active: boolean`, `blockCountMapJson: string`, `blockOpsListJson: string` | void | Reports block selection operations and counts to Android for native toolbar rendering. [VERIFIED] | ✅ Yes — no-op |
| `onBlockSelectedStateChange` | `nodeName: string`, `selected: boolean` | void | Reports individual block selection state change. [VERIFIED] | ✅ Yes — no-op |

---

### 3.16 Limits & Toasts

| Method | Parameters | Return | Purpose | Independently Implementable? |
|---|---|---|---|---|
| `onShowLimitToastOnImgTextPaste` | `i: number`, `z: boolean`, `z2: boolean` | void | Shows a native toast warning about content limit on paste. [VERIFIED] | ✅ Yes — show web toast |
| `onShowReachTextLimitToast` | (none) | void | Shows native toast when text character limit is reached. [VERIFIED] | ✅ Yes — show web toast |
| `onShowPictureGuideTips` | `rect: string`, `str: string` | void | Shows native picture guide tips overlay. [VERIFIED] | ✅ Yes — show web tooltip |

---

## 4. Bridge Compatibility Classification

| Category | Handlers | Classification | Notes |
|---|---|---|---|
| **Content Lifecycle** | Init, Update, Clear, SetText | ✅ Fully Web/Standard | All use standard TipTap APIs |
| **Content Retrieval** | GetHTML, GetText, GetAttachments, GetCursor | ✅ Fully Web/Standard | DOM/TipTap queries |
| **Text Formatting** | Bold, Italic, Underline, Color, Font | ✅ Fully Web/Standard | Standard TipTap mark commands |
| **Block/Paragraph Formatting** | Heading, Blockquote, Indent, HRule | ✅ Fully Web/Standard | Standard TipTap node commands |
| **List Operations** | Bullet, Ordered, Task | ✅ Fully Web/Standard | Standard TipTap list extensions |
| **Undo/Redo** | Undo, Redo, Rollback | ✅ Fully Web/Standard | TipTap history extension |
| **Search** | Search, Next, Previous, Clear | ✅ Fully Web/Standard | Custom search extension |
| **Image/Media** | Insert, Update, Replace, Delete | ⚠️ Requires Native Android Adapter | Thumbnail/upload URIs are Android `content://` paths; browser needs path remapping |
| **Audio/Record** | Insert, Update, Play state | ⚠️ Requires Native Android Adapter | Audio playback driven by Android media player; JS only renders state |
| **Cards (Web/Contact/Schedule/File)** | Insert, Update, Convert | ⚠️ Requires Native Android Adapter | URL fetch, contact/calendar APIs require Android; web fallback is possible for display |
| **Paint (Drawing Canvas)** | Insert, Edit, Update, Split | ⚠️ Requires Native Android Adapter | Paint canvas is a separate native view overlaid; JS only manages placeholder nodes |
| **Table Operations** | Insert, Add/Remove Row/Col | ✅ Fully Web/Standard | Standard TipTap table extension; native menus can be replaced with web UI |
| **Selection & Clipboard** | Select, Copy, Cut, Paste | ✅ Fully Web/Standard | Standard browser clipboard APIs with native fallback |
| **Block Selection/Drag** | Block select, Drag start/end/drop | ⚠️ Requires Native Android Adapter | `startDragFromJs` / `startBlockDragFromJs` require Android DragAndDrop framework |
| **Display & Layout** | UiMode, Scale, CSS vars, Focus | ✅ Fully Web/Standard | All CSS-based; can be driven from browser |
| **Capture/Share** | CaptureElement, ShareTable | ✅ Fully Web/Standard | html2canvas is bundled; output can be downloaded |
| **AIGC/AI Features** | Rewrite, Summary, AiKit | ❌ Requires Custom Backend | All AI operations require ColorOS AIGC cloud service |
| **Logging** | onJsLogPrint, uncaughtException | ✅ Fully Web/Standard | Redirect to `console.*` |
| **Lifecycle Signals** | onMounted, onFocus | ✅ Fully Web/Standard | No-op stubs sufficient |
| **Device/System Queries** | isImeVisible, getAndroidVersion | ✅ Fully Web/Standard | Stub return values |
| **Contact/Schedule/Telephony** | onContactCallClick, onScheduleAddClick | ❌ Requires Custom Backend | Android system APIs not available in browser |

---

## 5. Mock Bridge Requirements

To run the TipTap editor standalone in a browser (without the Android host), you need to implement a **Mock Bridge** that satisfies the following:

### 5.1 Minimum Required Stubs (`window.injectedObject`)

Create `window.injectedObject` with these methods before the bundle loads:

```javascript
window.injectedObject = {
  // Logging (redirect to console)
  onJsLogPrint: (level, tag, msg) => console[level === 'e' ? 'error' : level === 'i' ? 'info' : 'log'](`[${tag}] ${msg}`),
  onHandleJsUncaughtException: (json) => console.error('JS Exception:', json),

  // Lifecycle
  onTipTapMounted: () => {},

  // Content updates (no-op or persist to localStorage)
  onContentJsonUpdate: (json) => {},
  onTitleChange: (title) => {},
  onTitleJsonUpdate: (json) => {},
  onTitleFocus: (focused) => {},
  onTitleHeightChange: (h) => {},
  onContentFocus: (focused) => {},
  onContentCountChange: (chars, words) => {},
  onContentLineHeightChange: (h) => {},
  onContentHasTable: (has) => {},
  onHorizontalCountChange: (count) => {},

  // Selection & marks (no-op)
  isNodeOrMarkActive: (...args) => {},
  onSelection: (json) => {},
  showRichTextFormatMenu: (propsJson) => { /* show custom web slash menu */ },
  removeSlashSymbol: () => {},
  onTextInput: (text) => {},
  onTextAlignActive: (active, align) => {},
  onBulletListSymbolChange: (symbol) => {},
  redoAvailable: (available) => {},
  undoAvailable: (available) => {},

  // Interaction events
  onLongClick: (...args) => false,        // MUST return boolean
  onImageClick: (src, str) => {},
  onImageDoubleClick: (src) => {},
  onVideoClick: (src, dur, name) => {},
  onLinkClick: (href, ...rest) => window.open(href, '_blank'),
  onCardClick: (url) => window.open(url, '_blank'),
  onPaintClick: (...args) => {},
  onPaintTipsClick: (...args) => {},
  onTaskClick: (clicked) => {},
  onClickEditorOutside: (z) => {},
  onInterceptWebEditorClickCall: () => {},
  onCopyViewClick: (text) => navigator.clipboard?.writeText(text),
  lastEmptyTextClick: (pos, i) => {},
  onTextClick: (pos, i, selJson) => {},
  onTextDragStart: () => {},
  onTextDragEnd: () => {},
  onNodeAdded: (name, attrs) => {},
  onNodeDeleted: (name, str) => {},

  // Scroll
  onRequestDisallowInterceptTouchEvent: (disallow) => {},
  setOverScrollEnable: (enabled) => {},
  scrollend: () => {},
  isOverScrolling: () => false,           // MUST return boolean
  inBlockHorizontalSliding: (sliding) => {},
  isBlockHorizontalSlidingDisable: () => false, // MUST return boolean

  // Clipboard
  handlePaste: (shiftKey) => null,        // return null = use browser clipboard
  handlePasteAttach: (json) => json,      // identity passthrough
  handleAttachCopy: (type, needCopy) => {},
  handleCopyOrCut: (...args) => {},
  handleDrop: (count) => {},
  startDragFromJs: (...args) => false,    // MUST return boolean
  startBlockDragFromJs: (...args) => false,

  // Paint (no-op stubs)
  exitOverlayModeFromJs: (mode) => {},
  onEditingPaintRectChanged: (str) => {},
  onEditingPaintUpdated: (str) => {},
  onNewPaintEditing: (str) => {},
  onDoodleUndoRedo: (canUndo) => {},

  // Tables (no-op; replace with web UI as needed)
  onClickTableMenu: (x, y, info) => {},
  onShowTableSelectMenu: (x, y, info) => {},
  onTableColorActive: (active, color) => {},
  onTableCellContentOverflow: () => {},
  onTableColumnsOverLimit: () => alert('Max columns reached'),
  onTableRowsOverLimit: () => alert('Max rows reached'),
  onTablesOverLimit: () => alert('Max tables reached'),
  pastedUnsupportedDataInTable: () => {},
  isNewTblVersion: () => true,            // MUST return boolean

  // Cards (no-op)
  onContactCallClick: (str) => {},
  onContactSaveClick: (name, phone, email, addr) => {},
  onScheduleAddClick: (id) => {},
  onAddressNavigateClick: (addr) => window.open(`https://maps.google.com?q=${encodeURIComponent(addr)}`, '_blank'),

  // Audio (no-op)
  onAudioDetailClick: (id, z) => {},
  onRecordPlayClick: (rect, z, id) => {},
  onRecordStopTrackingTouch: (i, id) => {},
  onWebAudioComponentLoaded: (id) => {},
  onObserveRecordCardVisible: (z, str) => {},

  // Document
  onDocumentFileClick: (path, name) => {},

  // System
  isImeVisible: () => false,             // MUST return boolean
  hideSoftInput: () => document.activeElement?.blur(),
  disableShowIme: () => {},
  checkIfHasPaint: (has) => {},
  checkInCall: () => false,              // MUST return boolean
  pathExists: (path) => false,           // MUST return boolean
  findFirstPngFileWithPrefix: (dir, prefix) => '',
  getAndroidString: (name) => name,      // return name as fallback
  getAndroidVersion: () => 34,           // Android 14 / API 34
  performVibrate: () => navigator.vibrate?.(50),
  onPerformFeedback: (...args) => {},

  // AIGC
  getAIGCCount: (i) => '0',             // MUST return string
  getAigcGenerateBarHeight: () => 0,    // MUST return number
  onAigcShareClick: (rect) => {},
  getUrlTitle: (cardList, i) => {},
  onAiKitCopyClick: (html) => navigator.clipboard?.writeText(html),
  onAiKitGetCacheData: (z, i) => '',    // MUST return string
  onAiKitRenderStarted: () => {},
  onAiKitRetryClick: () => {},
  onSummaryCancelClick: () => {},
  onSummaryRetryClick: () => {},
  onSummaryStopClick: () => {},

  // Block ops
  onBlockOperationsUpdated: (...args) => {},
  onBlockSelectedStateChange: (name, selected) => {},

  // Limits
  onShowLimitToastOnImgTextPaste: (...args) => {},
  onShowReachTextLimitToast: () => alert('Text limit reached'),
  onShowPictureGuideTips: (rect, str) => {},
};

// Second injected object for App.vue mount
window.injectedAppVueObject = {
  onAppVueMounted: () => ({ colorOSVersion: 14 }),  // MUST return object
};
```

### 5.2 WVJB Shim (`window.WVJBInterface` and `window.WebViewJavascriptBridge`)

```javascript
// Outbound: JS → Native (intercept notice() calls)
window.WVJBInterface = {
  notice: (jsonStr) => {
    const msg = JSON.parse(jsonStr);
    console.debug('[Bridge → Native]', msg);
    // Route to your mock handler registry and call response callback
    mockHandleOutbound(msg);
  }
};

// Inbound: Native → JS
window.WebViewJavascriptBridge = {
  _handleMessageFromJava: (msg) => {
    const { handlerName, data, callbackId } = msg;
    // Dispatch to registered JS handlers
    const handler = registeredHandlers[handlerName];
    if (handler) {
      handler(data, (response) => {
        if (callbackId) sendResponseToNative(callbackId, response);
      });
    }
  }
};
```

### 5.3 Bootstrap Sequence

The correct initialization order is:

```
1. window.injectedObject = { ... }          // Before bundle loads
2. window.injectedAppVueObject = { ... }    // Before bundle loads
3. window.WVJBInterface = { notice: ... }   // Before bundle loads
4. <script src="index.js">                  // Load bundle (registers all handlers)
5. Call callAttachTipTapFromJava            // Mount editor Vue component
6. Call callInitContentFromJava             // Load initial content
```

### 5.4 Critical Return Types

These methods **must** return a value (synchronous `@JavascriptInterface` calls); returning `undefined` will cause the JS caller to behave unexpectedly:

| Method | Required Return Type | Safe Mock Value |
|---|---|---|
| `isImeVisible` | `boolean` | `false` |
| `isOverScrolling` | `boolean` | `false` |
| `isBlockHorizontalSlidingDisable` | `boolean` | `false` |
| `checkInCall` | `boolean` | `false` |
| `pathExists` | `boolean` | `false` |
| `isNewTblVersion` | `boolean` | `true` |
| `onLongClick` | `boolean` | `false` |
| `startDragFromJs` | `boolean` | `false` |
| `startBlockDragFromJs` | `boolean` | `false` |
| `handlePaste` | `string \| null` | `null` |
| `handlePasteAttach` | `string` | `""` |
| `getAndroidString` | `string` | `strName` |
| `getAndroidVersion` | `number` | `34` |
| `getAIGCCount` | `string` | `"0"` |
| `getAigcGenerateBarHeight` | `number` | `0` |
| `onAiKitGetCacheData` | `string` | `""` |
| `findFirstPngFileWithPrefix` | `string` | `""` |
| `injectedAppVueObject.onAppVueMounted` | `{ colorOSVersion: number }` | `{ colorOSVersion: 14 }` |

---

*Document generated from reverse engineering of `WVJBWebView.java`, `WVJBWebView.kt`, `TiptapContentInfo.kt`, and `index.js` (IIFE bundle). All findings are labeled [VERIFIED], [INFERRED], or [UNKNOWN].*

## 6. Verified Compatibility Audit

This section supersedes any conflicting counts or blanket portability statements above. `index.js` is minified; source locations below use bundle line 362 and the byte/string offset from `bridge_api_inventory.json` where available.

### Counts and Transport

| Surface | Count | Evidence | Meaning |
|---|---:|---|---|
| JS handlers registered with `WebViewJavascriptBridge.registerHandler` | 188 | `extract_bridge.py` → `bridge_api_inventory.json` | Android-to-JavaScript operations in this bundle, including `_hasJavascriptMethod`. |
| Android proxy methods annotated `@JavascriptInterface` | 107 | `com/oplus/notes/webview/cache/a.java:18-1090` | JavaScript-to-Android methods exposed through the `injectedObject` object. |
| Proxy method names found in `index.js` | 99 | Exact-name search of the bundle | Name occurrence only; not a call-reachability proof. Eight have no direct name match. |

[VERIFIED] `WVJBWebView.a.notice(String)` accepts JS messages (`WVJBWebView.java:114-120`); the view registers it as `WVJBInterface` (`:437`). Native-to-JS requests are wrapped for `_handleMessageFromJava` and sent through `evaluateJavascript` (`:703-722`). `g.c(...)` sends `callInitContentFromJava` or `callUpdateContentFromJava` (`com/oplus/notes/webview/container/web/g.java:168-190`). The generic WVJB layer is reusable; Android-specific callback implementations are not.

The 188 registration bodies generally receive `(data, callback)` (minified identifiers vary). [VERIFIED] Contracts directly inspected:

| Handler | Input | Callback / effect | Source |
|---|---|---|---|
| `callInitContentFromJava` | JSON string `TiptapContentInfo` | Parses and loads content; callback is passed through to downstream completion; exact completion values not fully resolved | `index.js:534`, offset 817407; `g.java:168-190` |
| `callUpdateContentFromJava` | JSON string `TiptapContentInfo` | Replaces body and replies `"done"` | `index.js:362`, offset 612422 |
| `callGetAllHTMLFromJava` | Input is unused by inspected body | Callback receives HTML string from `ch(view, doc.content)` | `index.js:362`, offset 615336; native request at `WebViewContainerImpl.java:958` |
| `callGetTextAndHtmlFromJava` | Input unused | Callback receives JSON `{text, htmlData:{content}, textIncludePaint}`; implementation reads body text, HTML, and paint-inclusive text | `index.js:362`, offset 599079; native request at `WebViewContainerImpl.java:1055` |
| `callGetAttachmentsFromJava` | Input unused | Callback receives `GM(editor)` result | `index.js:362`, offset 613086; native request at `WebViewContainerImpl.java:2572` |
| `callSetBoldFromJava`, `callSetItalicFromJava`, `callSetStrikethroughFromJava` | JSON parsed by handler | Applies command, updates native mark state, replies `"done"` | `index.js:362`, offsets 601600, 601467, 602247 |
| `callSetUnderlineFromJava` | JSON with `color` and `style` | Applies underline and replies `"done"` | `index.js:362`, offset 601976 |
| `callSetFontSizeFromJava` | String parsed with `parseInt` | Applies size; inspected handler does not call callback | `index.js:362`, offset 602394 |
| `callSetTextColorFromJava`, `callSetTextHighlightFromJava` | Color string; JSON respectively | Applies style and replies `"done"` | `index.js:362`, offsets 601868, 602123 |
| `callSetTitleStyleFromJava` | `Fn(data)` query/options wrapper | Applies title style, replies `"done"` | `index.js:362`, offset 600936 |
| `callToggleBulletListFromJava`, `callToggleOrderedListFromJava`, `callToggleTaskListFromJava` | `Fn(data)` optional `query` | Runs matching editor command and replies `"done"` | `index.js:362`, offsets 602627, 602871, 603257 |
| `callInsertTableFromJava` | Passed to `iR(editor, data)` | Replies string `"true"`/`"false"` | `index.js:362`, offset 623654 |
| `callAddRowInTableFromJava`, `callAddColumnInTableFromJava` | Input unused by inspected body | Adds after current row/column and replies `"true"`/`"false"` | `index.js:362`, offsets 623833, 623995 |
| `callInsertImageFromJava` | Data passed to `wb(editor, data)` | Inserts/updates editor state and replies `"done"` | `index.js:362`, offset 596099 |
| `callInsertContactCardFromJava`, `callInsertScheduleCardFromJava`, `callInsertRecordCardFromJava`, `callInsertFileCardFromJava` | Data passed to `vM`, `yM`, `SM`, `CM` | Inserts corresponding node view and replies `"done"` | `index.js:362`, offsets 605066, 605179, 605293, 605405 |
| `callUndoFromJava`, `callRedoFromJava` | Input unused by inspected body | Calls custom history command, updates native mark state, replies `"done"` | `index.js:362`, offsets 604287, 604802 |
| `callStartSpeechRecognizeFromJava` | Input unused | Replies `"done"`; no speech recognition is implemented in this handler | `index.js:362`, offset 600347 |
| `callOnGlobalDragStartFromJava` | JSON parsed as drag information | Resets drag flags, dispatches block drag when applicable, replies `"done"` | `index.js:534`, offset 820817 |

For all other registrations, exact payload fields, return semantics, and host feature dependencies are **[UNKNOWN] unless the adjacent existing section cites an inspected body or Android call site**. Do not interpret descriptive handler names as a complete contract.

### Complete Native-to-JavaScript Registration Catalog

Each name below is a [VERIFIED] registration in `index.js`; category purpose is [INFERRED] from its name unless explicitly verified in the table above. Direction for all entries is Android → JavaScript. Generic input is handler `data`; callback presence/meaning is [UNKNOWN] except as above. Android-specific calls are possible but not implied by registration.

| Area | Registered handler names |
|---|---|
| Lifecycle, content, layout, and lookup | `_hasJavascriptMethod`, `callAttachTipTapFromJava`, `callInitContentFromJava`, `callUpdateContentFromJava`, `callClearContentFromJava`, `callSetTextFromJava`, `callInsertTextWithHistoryFromJava`, `callInsertHintTextFromJava`, `callInsertPhoneHintTextFromJava`, `callNotifyIdleFromJava`, `callUpdateContentHeightFromJava`, `callSetUiModeFromJava`, `callSetDensityScaleFromJava`, `callSetEditorScaleFromJava`, `callSetTransformFromJava`, `callChangeWebViewWidthScaleFromJava`, `callSetBasicCssParamsFromJava`, `callSetSkinCssParamsFromJava`, `callSetPanelHeightFromJava`, `callUpdateTimeBarHeightFromJava`, `callSetUserScrollFromJava`, `callScrollToBottomFromJava`, `callLoadFontListFromJava`, `callFocusFromJava`, `callClearFocusFromJava`, `callSetKeyBoardEventFromJava`, `callDisableDocumentEventFromJava`, `callEditorInterceptClickFromJava` |
| Retrieval, selection, and geometry | `callGetAllHTMLFromJava`, `callGetTextAndHtmlFromJava`, `callGetAttachmentsFromJava`, `callGetBlockContentWidthFromJava`, `callGetCursorStartPosition`, `callGetEditorsHeightFromJava`, `callGetFocusedEditorFromJava`, `callGetHasLinkCard`, `callGetImageRectByAttachIdFromJava`, `callGetNodeRectByCoordsFromJava`, `callGetNodeRectBySrcFromJava`, `callGetPaintAttachmentFromJava`, `callGetPaintBackgroundFromJava`, `callGetPaintDisplayDimensionsFromJava`, `callGetRecordCardRectFromJava`, `callGetRecordDetailRectFromJava`, `callGetSelectTextFromJava`, `callGetSelectedBlockFromJava`, `callGetSelectedPaintAttachIdsFromJava`, `callGetSelectedPaintBackgroundTypesFromJava`, `callGetSelectedTextFromJava`, `callGetSelectionCoordsAndHasMarks`, `callGetTableFullDisplayWidthFromJava`, `callSelectAndGetAllTextFromJava`, `callSelectAndGetForwardAllTextFromJava`, `callSelectRangeTextAIGCFromJava`, `callSetTextSelectionFromJava`, `callSetTextSelectionAllFromJava`, `callCancelTextSelectionAllFromJava`, `callToggleSelectionAllFromJava`, `callScrollIntoViewFromJava`, `callScrollToAttachmentFromJava`, `callCaptureElementFromJava` |
| Formatting, blocks, and lists | `callSetBackgroundColorFromJava`, `callSetBlockQuoteFromJava`, `callSetBoldFromJava`, `callSetContentStyleFromJava`, `callSetFontFamilyFromJava`, `callSetFontSizeFromJava`, `callSetItalicFromJava`, `callSetStrikethroughFromJava`, `callSetTextAlignFromJava`, `callSetTextColorFromJava`, `callSetTextHighlightFromJava`, `callSetTitleStyleFromJava`, `callSetUnderlineFromJava`, `callIncreaseIndentFromJava`, `callDecreaseIndentFromJava`, `callAddHorizontalRuleFromJava`, `callUpdateHorizontalRuleFromJava`, `callToggleBulletListFromJava`, `callToggleBulletListHXFromJava`, `callToggleOrderedListFromJava`, `callToggleTaskListFromJava`, `callResetQuickInputFormatFromJava`, `callAddQuickInputSlashFromJava` |
| History and search | `callUndoFromJava`, `callRedoFromJava`, `callRollBackSpecifiedTimesFromJava`, `callSearchFromJava`, `callMatchNextFromJava`, `callMatchPreviousFromJava`, `callClearSearchResultFromJava`, `resetQueryFromJava` |
| Images, video, and generic attachments | `callInsertImageFromJava`, `callUpdateImageFromJava`, `callReplaceNodeByImageFromJava`, `callSwitchImageSizeFromJava`, `callEnableImageAnimationFromJava`, `callSetImageShareNoticeFromJava`, `callInsertVideoPlaceHolderFromJava`, `callReplaceNodeByVideoFromJava`, `callUpdateVideoFromJava`, `callDeleteNodeByAttachIdFromJava`, `callDeleteSelectedNodeFromJava`, `callMoveAttachToSelectionFromJava`, `callReplaceAttachmentByTextFromJava`, `callUpdateElementAttributesFromJava`, `callPastAttachEndFromJava`, `callPasteInEditorFromJava`, `callCopyInEditorFromJava`, `callCutInEditorFromJava` |
| Cards and files | `callInsertCardFromJava`, `callUpdateCardFromJava`, `callUpdateCardInfoFromJava`, `callReplaceNodeByCardFromJava`, `callConvertToCardFromJava`, `callConvertToCardByBlockFromJava`, `callConvertToLinkFromJava`, `callConvertToLinkByBlockFromJava`, `callInsertContactCardFromJava`, `callInsertScheduleCardFromJava`, `callInsertFileCardFromJava`, `callReplaceNodeByDocumentFromJava`, `callUpdateFileDocThumbnailFromJava`, `callUpdateFileNameFromJava` |
| Audio and speech | `callInsertRecordCardFromJava`, `callReplaceNodeByAudioFromJava`, `callUpdateRecordFromJava`, `callUpdateRecordStateFromJava`, `callUpdateRecordCallLogsFromJava`, `callSetRecordCurrentTimeFromJava`, `callRecordDisableFromJava`, `callStartSpeechRecognizeFromJava` |
| Tables | `callInsertTableFromJava`, `callAddRowInTableFromJava`, `callRemoveRowInTableFromJava`, `callMoveRowInTableFromJava`, `callAddColumnInTableFromJava`, `callRemoveColumnInTableFromJava`, `callMoveColumnInTableFromJava`, `callSetTableColorFromJava`, `callShareTableToPictureFromJava`, `callOnTableMenuDismissFromJava`, `callOnTableSelectMenuDismissFromJava`, `callOnAIGCTableInsertFromJava` |
| Block selection and drag | `callExitBlockSelectionModeFromJava`, `callDelBlockSelectionModeFromJava`, `callShareBlockSelectionModeFromJava`, `callOnGlobalBlockPasteFromJava`, `callOnGlobalDragStartFromJava`, `callOnGlobalDragEnterFromJava`, `callOnGlobalDragLocationFromJava`, `callOnGlobalDragDropFromJava`, `callOnGlobalDragEndFromJava`, `callOnGlobalDragOtherPasteEndFromJava`, `callHandleViewHandStateChange` |
| Paint and drawing | `callActiveTargetPaintFromJava`, `callDeleteNewPaintFromJava`, `callInsertNewPaintFromJava`, `callInsertOrActivatePaintFromJava`, `callIsPaintUnderTargetNodeFromJava`, `callPaintIsScalingFromJava`, `callSplitPaintFromJava`, `callUpdateLastPaintEmptyFromJava`, `callUpdateNewPaintFromJava`, `callUpdateSelectedPaintBackgroundFromJava`, `callUpdateTargetPaintEditingFromJava`, `callHandleViewHandStateChange` |
| AI and summary | `callOnAIGCGetSelectHtmlTextFromJava`, `callOnAIGCRewriteDeleteFromJava`, `callOnAIGCRewriteFinishFromJava`, `callOnAIGCRewriteInsertFromJava`, `callOnAIGCRewriteReplaceFromJava`, `callOnAIGCRewriteResultFromJava`, `callOnAIGCRewriteStartFromJava`, `callOnAIGCSelectAllTextFromJava`, `callOnAIKITUpdateCacheInfoFromJava`, `callOnAIKITUpperScreenScrollDataFromJava`, `callOnActionItemClickedAfterFromJava`, `callOnActionItemClickedBeforeFromJava`, `callOnAiKitRewriteInsertFromJava`, `callOnAiKitRewriteReplaceFromJava`, `callOnGetAIGCHTMLContentFromJava`, `callInsertSummaryStreamTipFromJava`, `callUpdateSummaryStreamTipFromJava`, `callDeleteSummaryStreamTipFromJava`, `callSetAiSummaryStartStop`, `callSetSummaryEntityFromJava`, `callSetSummaryContentWithAnimation` |

> Catalog reconciliation: the source inventory has 188 unique names. Some handlers can span two feature concerns; the catalog is grouped for navigation and must be checked against the inventory for exhaustive compatibility work. Exact Android native call sites are not recoverable for every entry from names alone.

### JS-to-Android Method Surface

[VERIFIED] The native proxy class is `com/oplus/notes/webview/cache/a.java`, a delegating adapter implementing `com.oplus.notes.webview.container.api.a`. Its signatures, parameter types, and source lines are the authoritative method contract; the backing fragment is the behavior owner where implemented. Examples: `onContentJsonUpdate(String)` at `a.java:424` and `WVNoteViewEditFragment.java:17283`; `showRichTextFormatMenu(String)` at `a.java:1041` and fragment `:20647`; `startBlockDragFromJs(int,int,String,String,String,boolean)` at proxy `:1052` and fragment `:22916`. The feature-oriented tables plus the completed entries below now contain all 107 extracted method names. Full signature inventory is available in `bridge_api_inventory.json`.

| Method | Signature | Return | Meaning / compatibility | Source |
|---|---|---|---|---|
| `isExport` | `boolean isExport()` | boolean | Queries whether the host is currently exporting; purpose follows the method name. [INFERRED] A desktop adapter can return its export state. | `com/oplus/notes/webview/cache/a.java:190` |
| `onMatchResultUpdate` | `void onMatchResultUpdate(int i, int i2)` | void | Reports search match progress; likely current/total based on its name and JS callback use. [INFERRED] | `com/oplus/notes/webview/cache/a.java:592` |
| `onSkinScaleChanged` | `void onSkinScaleChanged(float f)` | void | Reports a skin scale change to the host. [INFERRED] Visual scale semantics need runtime verification. | `com/oplus/notes/webview/cache/a.java:764` |

## 7. Source and Graph Locator

- [VERIFIED] JAG application graph ID: `jag_e7ff18a2af3af0273c2764087ce82d5e5d7e6b5b443d7166c9884902f3214a33`; 615 nodes / 1,030 edges.
- [VERIFIED] Semantic graph source ranges use `jsrg_node_*`, `jsrg_relation_*`, and `jsrg_evidence_*` identifiers. The audit’s direct label query found no semantic nodes for five bridge names checked; this is a query/result limitation, not evidence that the operations are absent. Do not cite unrelated semantic IDs as feature nodes.
- [VERIFIED] The source-level bridge inventory records string offsets. The source line for the bulk registration block is `index.js:362`; initialization handlers also occur at line 534. Offsets in §6 are the disambiguator within minified lines.
