# Feature Implementation Map — ColorOS Notes TipTap Editor

> [!NOTE]
> This document maps every identified editor feature to its Android bridge handler, JavaScript function, TipTap extension, and extension metadata. Confidence levels: **[VERIFIED]** = extracted directly from `index.js`; **[INFERRED]** = reasoned from context/patterns.

---

## 1. Overview

The ColorOS Notes editor is a hybrid Android application. The editor UI is a TipTap (ProseMirror-based) instance running inside a `WebView`. Communication flows through two bridge layers:

- **JS → Android**: calls on `window.injectedObject.*` (JavascriptInterface) or `window.injectedAppVueObject.*`
- **Android → JS**: Android calls `callXxxFromJava` handler names registered via `WebViewJavascriptBridge` (WVJB)

The TipTap editor manages nodes and marks through named extensions. Each extension has a ProseMirror schema name (`mark` or `node` kind) and is registered in the editor's extension array.

---

## 2. Text Formatting

| Feature | Bridge Handler | JS Function | TipTap Extension | Extension Kind | Mark/Node Name | Notes |
|---|---|---|---|---|---|---|
| **Bold** | `callSetBoldFromJava` | `lM(editor, parsedData)` | `iT` | Mark | `"bold"` | `editor.chain().toggleBold()` [VERIFIED] |
| **Italic** | `callSetItalicFromJava` | `aM(editor, parsedData)` | `UT` | Mark | `"italic"` | [VERIFIED] |
| **Underline** | `callSetUnderlineFromJava` | `Ju(editor, color, style)` | `Sa` | Mark | `"underline"` | Input: `{color, style}`; adds CSS class `"note-underline"` [VERIFIED] |
| **Strikethrough** | `callSetStrikethroughFromJava` | `uM(editor, parsedData)` | `eb` | Mark | `"strike"` | [VERIFIED] |
| **Superscript** | [INFERRED — not extracted] | — | `rT` | Mark | `"superscript"` | CSS class `"note-superscript"` [INFERRED] |
| **Subscript** | [INFERRED — not extracted] | — | `aT` | Mark | `"subscript"` | CSS class `"note-subscript"` [INFERRED] |
| **Text Color** | `callSetTextColorFromJava` | `cM(editor, data)` | `U_` | Mark | `"color"` via `textStyle` | Sets foreground color attribute [VERIFIED] |
| **Background Highlight** | `callSetTextHighlightFromJava` | `_b(editor, parsedData)` | `J_` | Mark | `"backgroundColor"` | Inline highlight on selection [VERIFIED] |
| **Document BG Color** | `callSetBackgroundColorFromJava` | `dM(editor, data)` | — | — | — | Changes document-level background, not a TipTap mark [VERIFIED] |
| **Font Size** | `callSetFontSizeFromJava` | `Ib(editor, parseInt(data))` | `F_` | Mark | `"fontSize"` | No confirmation callback [VERIFIED] |
| **Font Family** | `callSetFontFamilyFromJava` | — | `j_` | Mark | `"fontFamily"` | Handler verified; JS function not extracted [VERIFIED] |
| **Text Align** | `callSetTextAlignFromJava` | — | `lh` | Extension | `"textAlign"` | Supports `start/center/end`; applied on `heading` and `paragraph` nodes [VERIFIED] |
| **Font Weight** | [INFERRED — no bridge handler] | — | `KR` | Mark | `"fontWeight"` | Separate from bold; likely set via textStyle [INFERRED] |

---

## 3. Block / Paragraph Formatting

| Feature | Bridge Handler | JS Function | TipTap Extension | Mark/Node Name | Notes |
|---|---|---|---|---|---|
| **Heading** | `callSetTitleStyleFromJava` | — | `LT` | `"heading"` | Levels 1–6; standard TipTap heading node [VERIFIED] |
| **Paragraph** | — | — | `Cu` | `"paragraph"` | Base paragraph node [VERIFIED] |
| **Blockquote** | `callSetBlockQuoteFromJava` | — | `Cp` | `"blockquote"` | [VERIFIED] |
| **MultiHeading** | `callSetTitleStyleFromJava` (shared or specialized) | — | `ng` | `"MultiHeading"` | Multi-level heading marks on `paragraph`/`listItem` nodes [INFERRED] |
| **Text Indent (Increase)** | `callIncreaseIndentFromJava` | — | `tb` | `"textIndent"` | Types: `["heading","paragraph","listItem","taskItem"]` [VERIFIED] |
| **Text Indent (Decrease)** | `callDecreaseIndentFromJava` | — | `tb` | `"textIndent"` | Same extension, decrease command [VERIFIED] |

---

## 4. Lists

| Feature | Bridge Handler | JS Function | TipTap Extension | Node Name | Notes |
|---|---|---|---|---|---|
| **Bullet List** | `callToggleBulletListFromJava` | `editor.commands.toggleBulletList()` | `DR` | `"bulletList"` | itemType: `"listItem"` [VERIFIED] |
| **Bullet List HX** | `callToggleBulletListHXFromJava` | `editor.commands.toggleBulletListHX()` | `I$` | `"bulletListHX"` | Heading-level bullet variant [VERIFIED] |
| **Ordered List** | `callToggleOrderedListFromJava` | `editor.commands.toggleOrderedList()` | `FR` | `"orderedList"` | [VERIFIED] |
| **Task List** | `callToggleTaskListFromJava` | `editor.commands.toggleTaskList()` | `GL`, `hv` | `"taskList"` | `hv` is draggable variant [VERIFIED] |
| **Task Item** | — | — | `YL` | `"taskItem"` | Click fires `injectedObject.onTaskClick(clicked)` [VERIFIED] |
| **List Item** | — | — | `Ba` | `"listItem"` | Shared by bullet and ordered lists [VERIFIED] |
| **List Keymap** | — | — | `jR` | `"listKeymap"` | Keyboard shortcuts for list navigation [VERIFIED] |
| **List Item Marker** | — | — | `qR` | `"list-item-marker"` | Renders custom bullet/number markers [VERIFIED] |

---

## 5. Slash Command System

**Extension:** `KE` (name: `"CustomSuggestion"`)

### Trigger Conditions
- `/` typed alone at the start of a line
- ` /` (space then slash) typed anywhere in content

### Flow: JS → Android → JS

```
User types "/" 
  → CustomSuggestion.onStart/onUpdate fires
  → injectedObject.showRichTextFormatMenu({query, clientRect})   [JS → Android]
  → Android renders native bottom sheet / popup menu
  → User selects a format option
  → Android calls call*FromJava for the chosen format            [Android → JS]
  → Editor applies the format
User dismisses / exits
  → injectedObject.removeSlashSymbol()                           [JS → Android]
  → Trigger character "/" is deleted from document
```

### Key Points
- The menu UI is **entirely native** (Android bottom sheet / dialog)
- The JS side only fires `showRichTextFormatMenu` and `removeSlashSymbol`
- All format options map to existing `call*FromJava` handlers
- Query string is passed so Android can filter options

---

## 6. Tables

### Table Nodes

| Node | Extension | Name |
|---|---|---|
| Table | `kT` | `"table"` (resizable: true) |
| Table Row | `m1` | `"tableRow"` |
| Table Cell | `p1` | `"tableCell"` |

Uses the `prosemirror-tables` library under the hood.

### Bridge Handlers

| Operation | Handler |
|---|---|
| Insert table | `callInsertTableFromJava` |
| Add row | `callAddRowInTableFromJava` |
| Remove row | `callRemoveRowInTableFromJava` |
| Move row | `callMoveRowInTableFromJava` |
| Add column | `callAddColumnInTableFromJava` |
| Remove column | `callRemoveColumnInTableFromJava` |
| Move column | `callMoveColumnInTableFromJava` |
| Set cell/table color | `callSetTableColorFromJava` |
| Share as image | `callShareTableToPictureFromJava` |

> [!NOTE]
> `callShareTableToPictureFromJava` uses `html2canvas.js` to rasterize the table DOM element to an image before sharing. [INFERRED from html2canvas.js dependency]

### JS → Android Callbacks

| Callback | Purpose |
|---|---|
| `injectedObject.onTableCellContentOverflow()` | Cell content exceeds bounds |
| `injectedObject.onTableColumnsOverLimit()` | Column count limit reached |
| `injectedObject.onTableRowsOverLimit()` | Row count limit reached |
| `injectedObject.onTablesOverLimit()` | Too many tables in document |
| `injectedObject.onClickTableMenu(x, y, menuInfo)` | User tapped table context menu trigger |
| `injectedObject.onShowTableSelectMenu(x, y, menuInfo)` | Show column/row select menu |

---

## 7. Block Drag and Reorder

### Extensions

| Extension | Name | Purpose |
|---|---|---|
| `U$` | `"blockExtension"` | Block selection and drag management |
| `z$` | `"CustomDropCursor"` | Visual drop cursor line between blocks |
| `nP` | `"BlockClipBoardPlugin"` | Clipboard state for block cut/copy |

### Full Drag Flow [INFERRED from handler implementations]

```
1. Android → JS: callOnGlobalDragStartFromJava
     → editor.commands.blockStartDrag(data)
     → JS computes block info, fires:
       injectedObject.startBlockDragFromJs(position, blockNumber, rect, clipDataInfo, captureElementInfo, z)

2. Android → JS: callOnGlobalDragLocationFromJava  (repeated)
     → editor.commands.blockDrag(data)
     → drop cursor moves to new position

3. Android → JS: callOnGlobalDragDropFromJava
     → drop finalized, block moved in document
```

### Key Bridge Points

| Direction | Call | Purpose |
|---|---|---|
| Android → JS | `callOnGlobalDragStartFromJava` | Initiate drag |
| Android → JS | `callOnGlobalDragLocationFromJava` | Update drag position |
| Android → JS | `callOnGlobalDragDropFromJava` | Finalize drop |
| JS → Android | `injectedObject.startBlockDragFromJs(...)` | Hand off drag to Android DnD system |

---

## 8. Image Insertion & Management

### Extensions

| Extension | Name | Purpose |
|---|---|---|
| `mr` | `"image"` | Image node (allowBase64: true) |
| `nE` | `"imageSizeHelper"` | Resize handle management |
| `W$` | `"small-pic-one-line-extension"` | Small image inline layout |

### Bridge Handlers (Android → JS)

| Handler | JS Function | Purpose |
|---|---|---|
| `callInsertImageFromJava` | `wb(editor, data)` | Insert image node |
| `callUpdateImageFromJava` | `RP(editor, data)` | Update image attributes |
| `callReplaceNodeByImageFromJava` | — | Replace placeholder node with image |

### JS → Android Callbacks

| Callback | Trigger |
|---|---|
| `injectedObject.onImageClick(src, str)` | Single tap on image |
| `injectedObject.onImageDoubleClick(src)` | Double tap on image |
| `injectedObject.onLongClick("image", ...)` | Long press on image |

---

## 9. Audio / Voice Attachments

**Node:** `vr` (name: `"record"`) — Vue component: `Record`

### Bridge Handlers (Android → JS)

| Handler | JS Function | Purpose |
|---|---|---|
| `callInsertRecordCardFromJava` | `SM(editor, data)` | Insert audio/voice card |
| `callUpdateRecordFromJava` | — | Update record metadata |
| `callUpdateRecordStateFromJava` | — | Update playback/recording state |
| `callUpdateRecordCallLogsFromJava` | — | Update call log association |
| `callSetRecordCurrentTimeFromJava` | — | Seek playback position |

### JS → Android Callbacks

| Callback | Purpose |
|---|---|
| `injectedObject.onRecordPlayClick(rect, z, attachId)` | User tapped play button |
| `injectedObject.onRecordStopTrackingTouch(i, picAttachId)` | User released seek bar |
| `injectedObject.onWebAudioComponentLoaded(attachId)` | Component mounted and ready |

---

## 10. File Attachments

**Node:** `yr` (name: `"filecard"`) — Vue component: `FileCard`

### Bridge Handlers (Android → JS)

| Handler | JS Function | Purpose |
|---|---|---|
| `callInsertFileCardFromJava` | `CM(editor, data)` | Insert file attachment card |
| `callUpdateFileDocThumbnailFromJava` | `wM(editor, data)` | Update file thumbnail |
| `callUpdateFileNameFromJava` | `kM(editor, data)` | Update displayed file name |

### JS → Android Callbacks

| Callback | Purpose |
|---|---|
| `injectedObject.onDocumentFileClick(path, fileName)` | User tapped file card → open in Android |

---

## 11. Contact Cards

**Node:** `Tr` (name: `"contactCard"`) — Vue component: `ContactCard`

### Bridge Handlers (Android → JS)

| Handler | JS Function | Purpose |
|---|---|---|
| `callInsertContactCardFromJava` | `vM(editor, data)` | Insert contact card |

### JS → Android Callbacks

| Callback | Purpose |
|---|---|
| `injectedObject.onContactCallClick(str)` | User tapped call button |
| `injectedObject.onContactSaveClick(name, phone, email, address)` | User tapped save contact |
| `injectedObject.onAddressNavigateClick(address)` | User tapped address → open maps |

---

## 12. Schedule Cards

**Node:** `br` (name: `"scheduleCard"`) — Vue component: `ScheduleCard`

### Bridge Handlers (Android → JS)

| Handler | JS Function | Purpose |
|---|---|---|
| `callInsertScheduleCardFromJava` | `yM(editor, data)` | Insert schedule reminder card |

### JS → Android Callbacks

| Callback | Purpose |
|---|---|
| `injectedObject.onScheduleAddClick(attrId)` | User tapped add/edit schedule button |

---

## 13. Link / Web Cards

**Node:** `gr` (name: `"card"`) — Vue component: `Card`

### Bridge Handlers (Android → JS)

| Handler | JS Function | Purpose |
|---|---|---|
| `callInsertCardFromJava` | `bM(editor, data)` | Insert web link card |
| `callUpdateCardFromJava` | — | Update card data |
| `callUpdateCardInfoFromJava` | — | Update card title/favicon/description |
| `callConvertToCardFromJava` | — | Convert inline text URL to card node |
| `callConvertToCardByBlockFromJava` | — | Convert block URL to card node |

### JS → Android Callbacks

| Callback | Purpose |
|---|---|
| `injectedObject.onCardClick(url)` | User tapped card → open URL in Android browser/WebView |

---

## 14. Video Cards

**Node:** `Sr` (name: `"videoCard"`) — Vue component: `VideoCard`

### Bridge Handlers (Android → JS)

| Handler | Purpose |
|---|---|
| `callInsertVideoPlaceHolderFromJava` | Insert loading placeholder for video |
| `callReplaceNodeByVideoFromJava` | Replace placeholder with final video node |
| `callUpdateVideoFromJava` | Update video metadata/thumbnail |

### JS → Android Callbacks

| Callback | Purpose |
|---|---|
| `injectedObject.onVideoClick(src, duration, fileName)` | User tapped video → open in Android player |

---

## 15. Drawing / Paint Blocks

### Nodes and Extensions

| Extension | Name | Purpose |
|---|---|---|
| `Ra` | `"paint"` | Paint block (version 1) — Vue component: `Paint` |
| `Ah` | `"paint"` | Paint block (version 2) — Vue component: `Paint2` |
| `Y$` | `"Paint2NeighborExtension"` | Manages neighbor-awareness for adjacent paint blocks |

> [!NOTE]
> `lottie-web.js` is used for animated paint backgrounds (e.g. paper texture animations). [INFERRED]

### Bridge Handlers (Android → JS)

| Handler | Purpose |
|---|---|
| `callInsertNewPaintFromJava` | Insert a new blank paint/drawing block |
| `callInsertOrActivatePaintFromJava` | Insert or activate existing paint block |
| `callActiveTargetPaintFromJava` | Activate a specific paint block for editing |
| `callUpdateTargetPaintEditingFromJava` | Update paint editing state |
| `callUpdateSelectedPaintBackgroundFromJava` | Change paint background type/pattern |

### JS → Android Callbacks

| Callback | Purpose |
|---|---|
| `injectedObject.onPaintClick(paintId, paintSrc, imageId, imageSrc)` | User tapped paint block |
| `injectedObject.onDoodleUndoRedo(canUndo)` | Notify Android of paint undo/redo state |
| `injectedObject.exitOverlayModeFromJs(uiMode)` | User switched from paint back to text edit mode |

---

## 16. Undo / Redo

### Extensions

| Extension | Name | Purpose |
|---|---|---|
| `w$` | `"customHistory"` | Custom history stack (depth: 100, newGroupDelay: 500ms) |
| `$E` | `"ObserveTitleHistoryExtension"` | Syncs note title undo with body undo |

### Bridge Handlers

| Handler | Action |
|---|---|
| `callUndoFromJava` | `editor.chain().customUndo().run()` + `updateNativeMarksStatus()` |
| `callRedoFromJava` | `editor.chain().customRedo().run()` + `updateNativeMarksStatus()` |

### IME-Aware Undo
When the soft keyboard is visible at undo time, the caret is hidden via CSS and undo is delayed by one animation frame to avoid visual glitches. [VERIFIED]

### JS → Android Availability Callbacks

| Callback | Purpose |
|---|---|
| `injectedObject.undoAvailable(boolean)` | Tell Android whether undo is possible |
| `injectedObject.redoAvailable(boolean)` | Tell Android whether redo is possible |

---

## 17. Note Content Retrieval & HTML Export

### Content Retrieval Modes

| Method | Handler | JS Function | Output |
|---|---|---|---|
| Auto JSON update | _(event-driven)_ | — | `injectedObject.onContentJsonUpdate(json)` — fires on every edit |
| Full HTML | `callGetAllHTMLFromJava` | `ch(view, doc.content)` | Returns HTML string |
| Text + HTML | `callGetTextAndHtmlFromJava` | — | `{text, htmlData:{content}, textIncludePaint}` |
| Attachment list | `callGetAttachmentsFromJava` | `GM(editor)` | JSON array of all attachment nodes |

### HTML Export Functions

| Function | Purpose |
|---|---|
| `ch()` | Generates HTML from ProseMirror document content |
| `yl()` | Post-processes HTML for export (sanitization, class injection) |
| `jP()` | Generates content-level HTML fragment |
| `XP()` | Generates text representation including paint blocks |
| `kb()` | Generates plain text data |

---

## 18. Search & Replace

**Extension:** `T$` (name: `"searchAndReplace"`)

### Bridge Handlers

| Handler | JS Function | Purpose |
|---|---|---|
| `callSearchFromJava` | `Mb(editor, data)` | Set search query and highlight matches |
| `callMatchNextFromJava` | `WM(editor)` | Navigate to next match |
| `callMatchPreviousFromJava` | `FM(editor)` | Navigate to previous match |
| `callClearSearchResultFromJava` | `Rb(editor)` | Clear highlights, exit search mode |

### JS → Android Callbacks

| Callback | Purpose |
|---|---|
| `injectedObject.onMatchResultUpdate(current, total)` | Update Android search result counter (e.g. "3 of 12") |

---

## 19. Element Capture & Sharing

| Handler | Purpose | Implementation |
|---|---|---|
| `callCaptureElementFromJava` | Rasterize a DOM element for sharing | Uses `html2canvas.js` [VERIFIED] |
| `callShareTableToPictureFromJava` | Capture table as PNG image | Uses `html2canvas.js` [VERIFIED] |

The capture result (base64 PNG or a URI) is returned to Android for further sharing via the native share sheet.

---

## 20. AIGC / AI Features

| Feature | JS → Android Callback | Purpose | Notes |
|---|---|---|---|
| AIGC count | `injectedObject.getAIGCCount()` | Check AI generation quota | Returns numeric string |
| AIGC bar height | `injectedObject.getAigcGenerateBarHeight()` | Get AI bar layout height | Returns number |
| AiKit render started | `injectedObject.onAiKitRenderStarted(...)` | Notify AI render begin | OPPO-specific |
| AiKit retry | `injectedObject.onAiKitRetryClick(...)` | Handle retry tap | OPPO-specific |
| AiKit copy | `injectedObject.onAiKitCopyClick(...)` | Handle copy tap | OPPO-specific |
| Summary cancel | `injectedObject.onSummaryCancelClick(...)` | AI Summary cancelled | OPPO-specific |
| Summary retry | `injectedObject.onSummaryRetryClick(...)` | AI Summary retry | OPPO-specific |
| Summary stop | `injectedObject.onSummaryStopClick(...)` | AI Summary stopped | OPPO-specific |

AI-related node views and protocol handlers are present, but not every capability is proven to require an OPPO service and no-op stubbing would remove user-facing behavior. Host service, local-model, and backend requirements remain feature-specific and must be traced before disabling or replacing them. See the source-verified audit in §22.

## 22. Source-Verified Feature Audit

The statements below take precedence over feature descriptions above where they conflict. The source bundle is minified; offsets are within `assets/index.js`, with the main handler block at line 362 and content/lifecycle registration at line 534. Android class paths are relative to `apk-work/jadx-out/sources/`.

| Feature | Directly verified JavaScript behavior | Native dependency / evidence | Confidence and portability |
|---|---|---|---|
| Bold / italic / strike | `callSetBoldFromJava`, `callSetItalicFromJava`, `callSetStrikethroughFromJava` parse JSON, invoke `lM` / `aM` / `uM`, update native mark state, and callback `"done"` (`index.js:362`, offsets 601600, 601467, 602247). | Native toolbar calls the WVJB handler; precise toolbar call sites not all enumerated. | [VERIFIED] ProseMirror formatting operation is JS-side; command can be hosted independently. |
| Underline | Parses `{color, style}`, calls `Ju`, callback `"done"` (`index.js:362`, offset 601976). | No device API needed for applying the mark. | [VERIFIED] JS-side. |
| Font size, color, highlight | Font size parses integer and calls `Ib` with no inspected callback (`offset 602394`); text color calls `cM`, highlight parses JSON and calls `_b`; both callback `"done"` (`index.js:362`, offsets 601868, 602123). | Custom fonts can arrive through `callLoadFontListFromJava`; font availability/source is host-controlled. | [VERIFIED] Formatting is JS-side; font acquisition/render parity is [UNKNOWN]. |
| Paragraph style / headings | `callSetTitleStyleFromJava` extracts an optional query, calls `is(editor, data)`, updates marks, and returns `"done"` (`index.js:362`, offset 600936). | Native toolbar provides style commands. | [VERIFIED] Editor operation; exact accepted style payload beyond observed wrapper is [UNKNOWN]. |
| Bullet / ordered / task lists | Each handler runs the matching TipTap command, optionally selects a query range, updates state, and returns `"done"` (`index.js:362`, offsets 602627, 602871, 603257). | `onTaskClick` is an Android callback method in the proxy (`cache/a.java:845`); platform side may handle task-specific action. | [VERIFIED] List document edits are JS-side. |
| Slash menu | `showRichTextFormatMenu(String)` is invoked by JS and implemented in `WVNoteViewEditFragment.showRichTextFormatMenu` (`:20647`); `removeSlashSymbol` is a host callback. | Android decides whether to show its native menu and gates it by quick-input settings (`:20647-20664`). | [VERIFIED] Trigger/editor integration is JS; original menu presentation is Android-specific. Browser replacement requires an equivalent web menu. Exact trigger constraints not revalidated. |
| Tables | Insert handler calls `iR` and returns string boolean; row/column add use focused table commands and return string booleans (`index.js:362`, offsets 623654, 623833, 623995). The registry also contains remove/move/color/share operations. | Context/select menus are mediated by `onClickTableMenu` / `onShowTableSelectMenu` native callbacks and dismissal handlers. | [VERIFIED] Core table mutations are JS; native menu UX/limits need adapters. Exact cell color semantics and row/column move contracts [UNKNOWN]. |
| Block selection and drag | `callOnGlobalDragStartFromJava` parses JSON, clears state flags, calls `blockStartDrag` when a drag editor exists, and responds `"done"` (`index.js:534`, offset 820817). | `startBlockDragFromJs(...)` is implemented in the Android fragment and starts Android-side drag workflow (`WVNoteViewEditFragment.java:22916-22940`). | [VERIFIED] Editing/selection state is JS; OS drag initiation is a custom native adapter. Web drag/drop needs independent runtime validation. |
| Images | `callInsertImageFromJava` calls `wb(editor, data)` and replies `"done"` (`index.js:362`, offset 596099); update handler calls `RP`. | Image selection, attachment paths, upload/thumbnail, share, and open handling cross native host. | [VERIFIED] Image node mutation is JS; picker/filesystem/attachment lifecycle needs adapter. Payload and path mapping are [UNKNOWN]. |
| Voice / audio | `callStartSpeechRecognizeFromJava` is a no-op except `callback("done")` (`index.js:362`, offset 600347). Record nodes are inserted through `SM` and rendered by the `Record` component (21-component inventory); playback state is updated by separate handlers. | Android proxy exposes `onRecordPlayClick`, `onAudioDetailClick`, `onWebAudioComponentLoaded`, etc. (`cache/a.java:309-965`); `RECORD_AUDIO` appears in manifest line 390. | [VERIFIED] Card rendering/command integration exists; recording, speech recognition, and playback execution are not implemented by the no-op handler and need native/browser media paths. |
| File attachment | `callInsertFileCardFromJava` invokes `CM` and replies `"done"` (`index.js:362`, offset 605405); thumbnail/name updates have separate handlers. | `onDocumentFileClick(path,fileName)` is implemented in `WVNoteViewEditFragment.java:17964`; filesystem URI access and opening are host behavior. | [VERIFIED] File card node is JS; file picker/path/security are adapter work. |
| Contact card | `callInsertContactCardFromJava` invokes `vM` and replies `"done"` (`index.js:362`, offset 605066). | Android callbacks `onContactCallClick` / `onContactSaveClick` route to fragment methods (`:17247` and adjacent code); these require telephony/contacts integration for parity. | [VERIFIED] Card node is JS; actions require platform adapter. |
| Schedule card | `callInsertScheduleCardFromJava` invokes `yM` and replies `"done"` (`index.js:362`, offset 605179). | `onScheduleAddClick` implemented in fragment at `:18684`; calendar insertion is native/platform behavior. | [VERIFIED] Card node is JS; calendar action needs adapter. |
| Paint / drawing | Bundle has `Paint`, `Paint2`, and corresponding paint handlers; inventory does not establish drawing engine implementation or serialize/reopen fidelity by itself. | Fragment has paint-specific methods and native paint save/edit lifecycle; APK packages native paint libraries and protobuf `paint_note_content.proto` (handover inventory). | [VERIFIED] Paint blocks are represented in editor; [UNKNOWN] parity/portability of the drawing engine. Must not claim fully portable canvas. |
| Undo / redo | `callUndoFromJava` / `callRedoFromJava` invoke `customUndo` / `customRedo`, update mark status, and respond `"done"` (`index.js:362`, offsets 604287, 604802). | `undoAvailable` / `redoAvailable` report state to native UI. | [VERIFIED] History operation is JS-side; synchronization with paint/doodle history is a separate host workflow. |
| Content retrieval / export | `callGetAllHTMLFromJava` serializes body HTML with `ch`; `callGetTextAndHtmlFromJava` returns JSON with `text`, `htmlData.content`, and `textIncludePaint`; attachments are returned by `GM(editor)` (`index.js:362`, offsets 615336, 599079, 613086). | Native calls are visible in `WebViewContainerImpl.java:958`, `:1055`, `:2572`. | [VERIFIED] Retrieval logic is JS-side. Round-trip equivalence of HTML/TipTap JSON and embedded assets needs tests. |

### Data Model and Confidence Notes

- [VERIFIED] Native `TiptapContentInfo` carries `tiptapContentJson` and `tiptapTitleJson` as nullable strings alongside legacy `content` HTML and JSON-encoded attachment/page/image fields (`com/oplus/notes/webview/data/TiptapContentInfo.java:24-37, 129-149`).
- [VERIFIED] Body changes reach `onContentJsonUpdate(String)` and update the editor ViewModel (`WVNoteViewEditFragment.java:17283-17289`). Immediate database commit frequency is not proven by this callback alone.
- [INFERRED] A ProseMirror-compatible host can reuse the content model, formatting/list/table commands, and serialization behavior. This is not a claim that the complete original bundle runs standalone.
- [UNKNOWN] The exact extension schema attributes, attachment binary/file mapping, paint state round-trip, component render-tree, and runtime failure behavior remain open.

---

## 21. Feature Completeness Summary

| Feature Area | Portability | Requires Native Adapter | Standalone Mock Possible |
|---|---|---|---|
| Text Formatting (bold/italic/strike/underline) | ✅ Fully portable | No | Yes |
| Font Size / Family / Color / Highlight | ✅ Fully portable | No | Yes |
| Text Align / Indent | ✅ Fully portable | No | Yes |
| Headings / Paragraph / Blockquote | ✅ Fully portable | No | Yes |
| Lists (bullet/ordered/task) | ✅ Fully portable | No | Yes |
| Slash Command Menu | ⚠️ UI is native | Yes (menu rendering) | Partial (can render web fallback) |
| Search & Replace | ✅ Fully portable | No | Yes |
| Undo / Redo | ✅ Fully portable | No | Yes |
| Content Export (JSON/HTML/text) | ✅ Fully portable | No | Yes |
| Tables | ⚠️ Operations portable | No (logic); Yes (overflow callbacks) | Yes |
| Images | ⚠️ Node portable | Yes (file picker, click handling) | Partial |
| Audio / Voice | ❌ Requires native playback | Yes | Partial (HTML5 audio fallback) |
| File Cards | ❌ Requires file system | Yes | Partial (file picker API) |
| Contact Cards | ❌ Requires contacts API | Yes | Stub only |
| Schedule Cards | ❌ Requires calendar API | Yes | Stub only |
| Link / Web Cards | ⚠️ Card node portable | Yes (URL fetch via Android) | Partial (use browser fetch) |
| Video Cards | ❌ Requires native player | Yes | Partial (HTML5 video) |
| Drawing / Paint | ⚠️ Needs canvas/lottie | Yes (overlay mode handoff) | Partial |
| Block Drag & Reorder | ⚠️ Logic portable | Yes (Android DnD system) | Partial (browser DnD) |
| Element Capture | ✅ Portable via html2canvas | No | Yes |
| AIGC / AI Features | ❌ OPPO-specific | Yes | Stub (no-ops) |
