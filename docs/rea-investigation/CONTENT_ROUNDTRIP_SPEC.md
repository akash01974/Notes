# Content Round-Trip Specification — ColorOS Notes TipTap Editor

> **Document Status**: Authoritative Technical Specification  
> **Source Files**: 
> - `apk-work/extracted/assets/tiptap/assets/index.js` (bundle v16.7.5)
> - `com/oplus/notes/webview/data/TiptapContentInfo.java`
> - `com/oplus/notes/webview/container/api/NoteDataInTipTap.java`
> - `com/oplus/notes/webview/container/api/NotePaintData.java`
> - `com/oplus/notes/webview/container/api/AttachData.java`
> - `com/oplus/notes/webview/container/api/ImageInfo.java`
> - `com/oplus/notes/webview/container/api/PaintInfo.java`
> - `com/nearme/note/activity/richedit/webview/WVNoteViewEditFragment.java`
> - `apk-work/standalone-smoke-test/results/results.json`
> - `apk-work/standalone-smoke-test/results/probe_calls.json`
> **Verification Status**: Complete static and runtime verification across headless Chromium 156 and production bytecode.

---

## 1. `TiptapContentInfo` Structure

`TiptapContentInfo` is the primary data transfer object sent from Android to the JavaScript TipTap editor to load or update note content. In native code, it is defined as a Kotlin data class at `com.oplus.notes.webview.data.TiptapContentInfo`.

### 1.1 Field Definitions & Types

| Field Name | Kotlin / Java Type | JSON Wire Type | Nullable? | Default Value | Purpose / Description |
|---|---|---|---|---|---|
| `guid` | `String` | `string` | No | `""` | Unique identifier of the note (UUID string or local ID). Assigned to `y.noteGuid.value` in JS. |
| `titleHintText` | `String` | `string` | No | `""` / `"Title"` | Placeholder text displayed when the title block is empty. Assigned to `S.multiHeading1Holder.value`. |
| `title` | `String` | `string` | No | `""` | Note title plain text. |
| `content` | `String` | `string` | No | `""` | Legacy HTML string. Used as fallback input to converter `Ma()` when `tiptapContentJson` is null. |
| `subAttachments` | `String` | `string` (serialized JSON array) | No | `"[]"` / `""` | Serialized JSON array of attachment metadata objects associated with the note. |
| `pageResults` | `String` | `string` (serialized JSON array) | No | `""` / `"[]"` | Serialized JSON array of page results (e.g. OCR text extraction results per attachment). |
| `pictureAttrs` | `String` | `string` (serialized JSON array) | No | `"[]"` / `""` | Serialized JSON array of image/card attributes (dimensions, crop data, display bounds). |
| `tiptapTitleJson` | `String?` | `string` (serialized JSON) or `null` | **Yes** | `null` | Reserved for ProseMirror title document JSON. **Never populated or consumed by the bundle.** |
| `tiptapContentJson` | `String?` | `string` (serialized JSON) or `null` | **Yes** | `null` | Full ProseMirror document JSON string (root `{"type":"doc",...}`). Preferred content format. |
| `isDoingSummary` | `Boolean` | `boolean` | No | `false` | Flag indicating whether AI summary stream generation is currently in progress. |

### 1.2 Concrete Payload Example

```json
{
  "guid": "c1f7a0b3-4e89-4d22-9a07-8899aabbccdd",
  "titleHintText": "Note title",
  "title": "Project Meeting Notes",
  "content": "<div><div class="h1">Project Meeting Notes</br></div><p>Action items for tomorrow.</p></div>",
  "subAttachments": "[]",
  "pageResults": "",
  "pictureAttrs": "[]",
  "tiptapTitleJson": null,
  "tiptapContentJson": "{"type":"doc","content":[{"type":"paragraph","attrs":{"multi-heading":"1"},"content":[{"type":"text","text":"Project Meeting Notes"}]},{"type":"paragraph","content":[{"type":"text","text":"Action items for tomorrow."}]}]}",
  "isDoingSummary": false
}
```

---

## 2. `NoteDataInTipTap` Structure

`NoteDataInTipTap` is the structured response model returned by JavaScript when the host queries document contents via `callGetTextAndHtmlFromJava`. It is defined natively at `com.oplus.notes.webview.container.api.NoteDataInTipTap`.

### 2.1 Field Schema

```
NoteDataInTipTap
├── text: String?                       (Extracted plain text from editor body via kb())
├── htmlData: NoteHtmlData?             (Object containing legacy-compatible cleaned HTML)
│   └── content: String                 (HTML markup cleaned via yl())
└── textIncludePaint: List<NotePaintData>? (Sequential block list indicating text vs drawing blocks)
    ├── text: String                    (Block plain text, including trailing newline)
    ├── isPaint: Boolean                (true if block represents an embedded canvas paint drawing)
    └── paintId: String                 (Attachment ID / paint ID if isPaint=true, else empty string)
```

### 2.2 Concrete Probed Payload (Verified from Chromium CDP Runtime Probe)

```json
{
  "text": "Probe line one",
  "htmlData": {
    "content": "<div><div class="h1">Probe line one</br></div><table attachid=""><tbody><tr><td><br></td><td><br></td></tr><tr><td><br></td><td><br></td></tr><tr><td><br></td><td><br></td></tr></tbody></table><br></div>"
  },
  "textIncludePaint": [
    {
      "text": "Probe line one
",
      "isPaint": false,
      "paintId": ""
    },
    {
      "text": "
",
      "isPaint": false,
      "paintId": ""
    },
    {
      "text": "
",
      "isPaint": false,
      "paintId": ""
    }
  ]
}
```

---

## 3. Blank-Note Initialization

When a user creates a new blank note, the host must execute a strictly ordered boot and initialization sequence to prevent crashes and ensure editability:

```mermaid
sequenceDiagram
    participant Host as Native Host / Harness
    participant App as App.vue
    participant TT as Tiptap.vue
    participant PM as ProseMirror Editor

    Note over Host,App: 1. Host loads assets/tiptap/index.html
    App->>Host: window.injectedAppVueObject.onAppVueMounted()
    Host-->>App: { colorOSVersion: 14 }

    Note over Host: 2. Host sends attach command
    Host->>App: callAttachTipTapFromJava("true")
    App->>TT: Mounts Tiptap.vue component (v-if)

    Note over Host: 3. Host injects mandatory theme colors (within 50ms)
    Host->>TT: callSetBasicCssParamsFromJava(basicCssJson)
    Note over TT: themeColors applied (avoids textColorHighlight crash)

    Note over Host: 4. Host sets UI mode to EDIT
    Host->>TT: callSetUiModeFromJava("3")
    Note over TT: Removes .hide-placeholder; adds tiptapContentParentEditMode

    TT->>Host: window.injectedObject.onTipTapMounted()
    Host->>Host: wVJBWebView.i("OnTipTapMounted") -> Unblocks queue

    Note over Host: 5. Host sends blank TiptapContentInfo
    Host->>TT: callInitContentFromJava(blankContentInfoJson)
    TT->>PM: Er(se) -> Sets initial empty document
    TT-->>Host: "done"
```

### 3.1 Blank-Note Payload Construction

The blank note payload must provide:
- `guid`: Fresh UUID string (e.g. `"f3b4821a-..."`).
- `titleHintText`: Localized title placeholder string (e.g. `"Note title"` or `"Title"`).
- `title`: Empty string `""`.
- `content`: Empty string `""`.
- `subAttachments`: `"[]"`.
- `pageResults`: `""`.
- `pictureAttrs`: `"[]"`.
- `tiptapTitleJson`: `null`.
- `tiptapContentJson`: `null` (or omit / null).
- `isDoingSummary`: `false`.

When `tiptapContentJson` is null and `content` is empty, TipTap initializes with default initial state: a single empty paragraph block with attribute `multi-heading="1"` and CSS class `block-wrapper topLevel is-empty` showing placeholder `"Note title"`.

---

## 4. Existing-Note Restoration

When opening an existing note from local storage, the host sends the stored note state via `callInitContentFromJava`:

1. **Preference for TipTap JSON**:
   - If `tiptapContentJson` is non-null and non-empty, the bundle parses it via `JSON.parse(B.tiptapContentJson)` and passes the resulting ProseMirror node tree directly to `Er(se)`.
   - The legacy `content` HTML string is **ignored** when `tiptapContentJson` is available.
2. **Fallback to Legacy HTML**:
   - If `tiptapContentJson` is null, but `content` is non-empty, the handler activates the conversion path:
     ```javascript
     y.isConvertingRawTex.value = true;
     se = Ma(B.guid, B.content, re, ae, me); // Converts HTML -> TipTap JSON
     y.isConvertingRawTex.value = false;
     ```
   - `Er(se)` then loads the converted document tree.
3. **Placeholder Restoration**:
   - `S.multiHeading1Holder.value = B.titleHintText` configures the title placeholder.
4. **Summary Card Visibility**:
   - `S.shouShowCard.value = !B.isDoingSummary` controls card display during active AI summary generation.

---

## 5. `callInitContentFromJava` Flow

### 5.1 Decompiled JavaScript Handler Implementation (`index.js:817520-818357`)

```javascript
registerHandler("callInitContentFromJava", (ee, k) => {
  const B = JSON.parse(ee);
  j("Tiptap", `callInitContentFromJava started content is null? = ${B.content === null}`, true);
  y.noteGuid.value = B.guid;
  console.log(`registerFunctionInitContent: ${JSON.stringify(B)}`);
  
  let se = B.tiptapContentJson != null ? JSON.parse(B.tiptapContentJson) : "";
  S.shouShowCard.value = !B.isDoingSummary;
  
  const ae = B.pageResults !== "" ? JSON.parse(B.pageResults) : [];
  const re = B.subAttachments !== "" ? JSON.parse(B.subAttachments) : [];
  const me = B.pictureAttrs !== "" ? JSON.parse(B.pictureAttrs) : [];
  
  if (B.content !== "") {
    console.log(`registerFunctionInitContent pageResults: ${B.pageResults}`);
    if (B.tiptapContentJson == null) {
      y.isConvertingRawTex.value = true;
      se = Ma(B.guid, B.content, re, ae, me);
      y.isConvertingRawTex.value = false;
    }
  }
  
  S.multiHeading1Holder.value = B.titleHintText;
  j("Tiptap", "callInitContentFromJava set content", true);
  Er(se);       // TipTap editor.setContent()
  k("done");    // Resolves bridge callback with "done"
});
```

### 5.2 Key Invariants:
- Input parameter `ee` is a JSON-serialized `TiptapContentInfo` string.
- Callback `k` is synchronously invoked with string `"done"`.
- The document history is initialized and ready for user transactions.

---

## 6. `callUpdateContentFromJava` Flow

Used by the host to replace active editor content during background synchronization, cloud restore, or external document replacement.

### 6.1 Decompiled JavaScript Handler Implementation (`index.js:612564-613151`)

```javascript
registerHandler("callUpdateContentFromJava", function(e, n) {
  const o = JSON.parse(e);
  console.log("callUpdateContentFromJava", o);
  let s = P.DEFAULT_CONTENT_PLACEHOLDER;
  S.shouShowCard.value = !o.isDoingSummary;
  
  const i = o.pageResults !== "" ? JSON.parse(o.pageResults) : [];
  const r = o.subAttachments !== "" ? JSON.parse(o.subAttachments) : [];
  const a = o.pictureAttrs !== "" ? JSON.parse(o.pictureAttrs) : [];
  
  if (o.content !== "") {
    const l = o.content;
    s = Ma(o.guid, l, r, i, a); // Legacy conversion
  }
  
  // Transactional content replacement with history reset
  t.chain()
    .clearContent()
    .blur()
    .setContent(s, null, { preserveWhitespace: "full" })
    .command(({ commands: l }) => (l.clearHistory(), true))
    .setMeta("addToHistory", false)
    .setMeta("autoLinkOnContentInitiation", true)
    .run();
    
  n("done");
});
```

### 6.2 Differences from `callInitContentFromJava`:
- Uses `t.chain().clearContent().setContent(...)` to atomically swap document state.
- Explicitly clears the undo history (`l.clearHistory()`) to prevent the user from undoing across the update boundary.
- Suppresses undo stack insertion via `.setMeta("addToHistory", false)`.
- Enables automatic URL linkification via `.setMeta("autoLinkOnContentInitiation", true)`.

---

## 7. `onContentJsonUpdate` Persistence Flow

Whenever the ProseMirror document changes (typing, deleting, formatting, pasting, dragging), TipTap emits its internal `update` event.

### 7.1 JavaScript Trigger (`index.js:468969`)

```javascript
const o = () => {
  try {
    const l = JSON.stringify(e.getJSON());
    if (c) { // Content dirty check
      console.log("observeContentJsonUpdate: sending update to native");
      n = l;
      window.injectedObject?.onContentJsonUpdate(l);
    }
  } catch (a) {
    console.error("observeContentJsonUpdate error:", a);
  }
};
e.on("update", o);
```

### 7.2 Native Persistence Handler (`WVNoteViewEditFragment.java:17283-17290`)

```java
@Override // com.oplus.notes.webview.container.api.a
public void onContentJsonUpdate(String json) {
    Intrinsics.checkNotNullParameter(json, "json");
    getMViewModel().setTiptapContentJson(json);
    PaintNoteStatisticsHelper.INSTANCE.onBlockOperation(getContext(), 3);
    com.oplus.note.logger.a.o.h(3, TAG, "--set--richNoteOperation ++$");
    NoteViewRichEditViewModel mViewModel = getMViewModel();
    mViewModel.setRichNoteOperation(mViewModel.getRichNoteOperation() + 1);
}
```

### 7.3 Operational Invariants:
- `json` is the full serialized ProseMirror document tree string (`{"type":"doc",...}`).
- The ViewModel stores the string in memory (`setTiptapContentJson`) and increments the dirty operation counter (`richNoteOperation`).
- Autosaving to SQLite (`rich_notes` table) is triggered asynchronously by the ViewModel's autosave debouncer (ControlledRunner).

---

## 8. Title Update Behaviour & Architecture

A critical architectural finding from reverse engineering is that **no separate HTML title input element exists in the web bundle**.

### 8.1 Unified Document Flow
- The note title is simply the **first block** in the ProseMirror document.
- The first block is styled with the custom mark/attribute `multi-heading="1"` (`blocktype="MultiHeading1"`), which renders placeholder `data-placeholder="title"`.
- The native host controls title styling using:
  `callSetTitleStyleFromJava({ "type": "title" })`
- Headings in ColorOS Notes are **not** HTML `<h1>`, `<h2>`, `<h3>` tags. They are all MultiHeading attributes on paragraph blocks:
  - `"1"`: Title (`MultiHeading1`)
  - `"2"`: Subtitle (`MultiHeading2`)
  - `"3"`: Small Title (`MultiHeading3`)

### 8.2 Title Change Observer (`index.js:461059`)

```javascript
observeTitleText(e) {
  const n = ie(() => {
    const s = _e().firstElementChild?.firstElementChild;
    return e.getText(),
      !s || s.tagName !== "P" || s.getAttribute("multi-heading") !== "1" ? "" : s.innerText;
  });
  
  ke(n, o => {
    window.injectedObject?.onTitleChange(o);
  }, { immediate: true });
}
```

### 8.3 Native Title Receiver (`WVNoteViewEditFragment.java:19056-19060`)

```java
@Override // com.oplus.notes.webview.container.api.a
public void onTitleChange(String title) {
    Intrinsics.checkNotNullParameter(title, "title");
    androidx.appsearch.platformstorage.e.c("onTitleChange: titleLength = ", title.length(), com.oplus.note.logger.a.g, 3, TAG);
    BuildersKt.launch$default(LifecycleOwnerKt.getLifecycleScope(this), null, null, 
        new WVNoteViewEditFragment$onTitleChange$1(this, title, null), 3, null);
}
```

### 8.4 The `onTitleJsonUpdate` Dead Path:
- Native declares `onTitleJsonUpdate(String json)` (`WVNoteViewEditFragment.java:19077`).
- In the bundle, this method has **0 call sites** (verified in `iface_usage.json: []`).
- The standalone smoke test confirmed: `callback counts={"contentUpdate":15,"titleJson":0,"titleChange":5}`.
- **Verdict**: ColorOS Notes stores title as plain text via `onTitleChange`. `tiptapTitleJson` is never used.

---

## 9. TipTap JSON Serialization Schema

The TipTap JSON document is a recursive ProseMirror document model.

### 9.1 Core Document Node Schema

```json
{
  "type": "doc",
  "content": [
    {
      "type": "paragraph",
      "attrs": {
        "multi-heading": "1",
        "textIndent": 0
      },
      "content": [
        {
          "type": "text",
          "text": "Meeting Agenda"
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "marks": [
            { "type": "bold" },
            { "type": "italic" }
          ],
          "text": "1. Review Q3 Goals"
        }
      ]
    },
    {
      "type": "bulletList",
      "content": [
        {
          "type": "listItem",
          "content": [
            {
              "type": "paragraph",
              "content": [
                { "type": "text", "text": "Product roadmaps" }
              ]
            }
          ]
        }
      ]
    },
    {
      "type": "table",
      "attrs": {
        "attachId": ""
      },
      "content": [
        {
          "type": "tableRow",
          "content": [
            {
              "type": "tableCell",
              "attrs": { "colspan": 1, "rowspan": 1, "colwidth": null },
              "content": [
                {
                  "type": "paragraph",
                  "content": [
                    { "type": "text", "text": "Cell A1" }
                  ]
                }
              ]
            },
            {
              "type": "tableCell",
              "attrs": { "colspan": 1, "rowspan": 1, "colwidth": null },
              "content": [
                {
                  "type": "paragraph",
                  "content": [
                    { "type": "text", "text": "Cell B1" }
                  ]
                }
              ]
            }
          ]
        }
      ]
    }
  ]
}
```

---

## 10. HTML Retrieval & Export

ColorOS Notes provides two separate handlers to retrieve document representations:

### 10.1 `callGetAllHTMLFromJava` — The Misleading Plain-Text Handler
- **Handler Name**: `callGetAllHTMLFromJava` (`index.js:615475`)
- **Decompiled Implementation**:
  ```javascript
  registerHandler("callGetAllHTMLFromJava", function(e, n) {
    setTimeout(() => {
      const o = ch(t.view, t.state.doc.content);
      console.log(`callGetAllHTMLFromJava, contentText:${o} `);
      n(o);
    });
  });
  ```
- **Function `ch()` (`index.js:15784`)**: Traverses ProseMirror nodes recursively, extracts plain text, inserts newlines (`\n`) between blocks, adds numbered list markers (`${l}. `), and indents with spaces.
- **Output**: Pure **plain text with newlines**. Despite its name, it does **not** return HTML markup!

### 10.2 `callGetTextAndHtmlFromJava` — The Multi-Format Document Exporter
- **Handler Name**: `callGetTextAndHtmlFromJava` (`index.js:599222`)
- **Decompiled Implementation**:
  ```javascript
  registerHandler("callGetTextAndHtmlFromJava", function(e, n) {
    const o = () => {
      const i = kb(t);        // Block text extraction
      const r = jP(t);        // Raw editor DOM HTML (index.js:643104)
      const a = XP(t);        // Sequential paint/text block array (index.js:643628)
      return { textData: i, contentHtml: r, textIncludePaint: a };
    };
    try {
      const { textData: i, contentHtml: r, textIncludePaint: a } = o();
      const l = { content: yl(r) }; // yl() cleans & normalizes HTML (index.js:257981)
      n(JSON.stringify({ text: i, htmlData: l, textIncludePaint: a }));
    } catch (err) {
      n(JSON.stringify({ bridgeName: "callGetTextAndHtmlFromJava", errorMessage: `${err}` }));
    }
  });
  ```
- **Output**: JSON string matching `NoteDataInTipTap`:
  - `text`: Extracted text from body.
  - `htmlData.content`: Clean legacy HTML string suitable for export or saving into SQLite `html_text`.
  - `textIncludePaint`: Array of block descriptors.

---

## 11. Plain-Text Retrieval

Plain text is queried natively through three endpoints:
1. **Full Body Text**: Extracted via `callGetTextAndHtmlFromJava` field `text`, which calls internal bundle function `kb(t)` (`index.js:643256`).
2. **Current Block / Selection**:
   - `callGetSelectTextFromJava` (`index.js:600014`): Returns currently selected substring in editor.
   - `callGetSelectedBlockFromJava` (`index.js:627661`): Returns JSON array of selected block node attributes.
3. **Title Text**:
   - Streamed synchronously to host via `window.injectedObject.onTitleChange(titleText)`.

---

## 12. Legacy HTML-to-TipTap Conversion (`Ma` Function)

The converter function `Ma` is located in `index.js` at character offset **228859**. It translates legacy ColorOS Notes HTML (pre-TipTap v16.x) into ProseMirror TipTap document JSON.

### 12.1 Function Signature & Flow (`index.js:228859-229200`)

```javascript
function Ma(guid, rawHtml, subAttachments, pageResults, pictureAttrs) {
  console.log(`converter, convertRawToTipTap before: rawText转换前${rawHtml}`);
  rawHtml = lk(rawHtml); // Normalizes HTML entities & breaks
  rawHtml = zT(rawHtml); // Cleans malformed tags
  console.log(`converter, handleHTMLText before: rawText转换前${rawHtml}`);
  
  const { htmlText: sanitizedHtml } = Eh(rawHtml);
  ak(sanitizedHtml, subAttachments, pictureAttrs);
  
  const outDoc = new Jt(); // String builder for TipTap JSON
  const parserState = new Ek();
  
  // SAX-style HTML parser traversal
  new pr({
    onopentag(tag, attrs) {
      ck(outDoc, tag, attrs, guid, subAttachments, pictureAttrs, parserState);
    },
    ontext(text) {
      dk(outDoc, text, pageResults, parserState);
    },
    onclosetag(tag) {
      uk(outDoc, tag, parserState);
    }
  }, { decodeEntities: false }).parseComplete(sanitizedHtml);
  
  const resultJson = outDoc.toString();
  console.log(`converter, convertRawToTipTap after: rawText转换后${resultJson}`);
  return resultJson;
}
```

### 12.2 Tag Mapping Matrix:

| Legacy HTML Tag | TipTap ProseMirror Target Node | Attributes Mapped |
|---|---|---|
| `<div class="h1">` / `<p class="h1">` | `paragraph` | `{"multi-heading":"1"}` |
| `<div class="h2">` / `<p class="h2">` | `paragraph` | `{"multi-heading":"2"}` |
| `<div class="h3">` / `<p class="h3">` | `paragraph` | `{"multi-heading":"3"}` |
| `<p>` / `<div>` | `paragraph` | `{"textIndent": N}` |
| `<b>` / `<strong>` | Mark: `bold` | — |
| `<i>` / `<em>` | Mark: `italic` | — |
| `<u>` | Mark: `underline` | `{"color": "...", "style": "..."}` |
| `<s>` / `<del>` | Mark: `strike` | — |
| `<ul>` / `<ol>` | `bulletList` / `orderedList` | `start`, `itemMarker` |
| `<li>` | `listItem` | — |
| `<table>` / `<tr>` / `<td>` | `table` / `tableRow` / `tableCell` | `colspan`, `rowspan`, `colwidth` |
| `<img attachid="...">` | `image` node | `attachId`, `src`, `width`, `height` |
| `<div type="paint" paintid="...">` | `paint` node | `paintid`, dimensions |

---

## 13. Attachment and Paint References Inside Content

### 13.1 `AttachData` Insertion Model (`com.oplus.notes.webview.container.api.AttachData`)

When media (images, drawings, voice clips, cards) is inserted, native passes serialized `AttachData` through handlers such as `callInsertImageFromJava` or `callInsertCardFromJava`.

Key attachment sub-models:
- **Image (`ImageInfo`)**:
  ```json
  {
    "src": "/data/user/0/com.coloros.note/files/notes/images/img_01.jpg",
    "attachId": "att_img_1730540000",
    "width": 1080,
    "height": 1920,
    "srcExist": true,
    "placeholderRelativePath": "images/placeholder.png",
    "isAiKit": false
  }
  ```
- **Drawing Canvas (`PaintInfo`)**:
  ```json
  {
    "attachId": "att_paint_1730540001",
    "paintId": "paint_99812",
    "dataPath": "/data/user/0/com.coloros.note/files/notes/paint/paint_99812.bin",
    "imagePath": "/data/user/0/com.coloros.note/files/notes/paint/paint_99812.png",
    "imageWidth": 1080.0,
    "imageHeight": 640.0,
    "backgroundType": "color_skin_white",
    "isEditing": false,
    "isInfoSaved": true
  }
  ```

### 13.2 Paint Node Extraction via `XP(t)` (`index.js:643628`)

When the document is saved, `XP(t)` walks all top-level ProseMirror nodes:
```javascript
function XP(t) {
  const e = t.state.doc, o = [];
  return e.content.forEach(s => {
    if (Me(s)) { // Table node
      const i = Gh(s);
      o.push({ text: i + "\n", isPaint: false, paintId: "" });
    } else if (ot(s)) { // Paint node
      o.push({ text: "", isPaint: true, paintId: s.attrs.paintid });
    } else if (Bt(s)) { // Horizontal Rule
      // Skip
    } else {
      const i = s.textBetween(0, s.content.size, "\n");
      o.push({ text: i + "\n", isPaint: false, paintId: "" });
    }
  }), o;
}
```

---

## 14. Round-Trip Limitations & Unverified Behaviors

| Component / Flow | Verified Fact | Limitation / Unknown Risk | Handling in Rebuild |
|---|---|---|---|
| **Editor Content** | TipTap JSON round-trip verified (15/15 PASS in Chromium). | Complex table nested formatting in legacy HTML converter `Ma()`. | Store TipTap JSON directly in SQLite `extra` or dedicated column; bypass HTML parsing. |
| **Title Persistence** | `onTitleChange` sends plain text string. | `onTitleJsonUpdate` is completely dead in bundle. | Store title in `rich_notes.title` / `raw_title` as plain string; do not expect title JSON. |
| **Block Content Width** | JS returns `"[object Object]"` via string interpolation. | Android native consumer uses `Float.parseFloat`, which would throw `NumberFormatException`. | In rebuild bridge, parse `contentWidth` float from object before sending to native callers. |
| **OPPO Selection Handles** | `Selection.showHandles()` is called after title style change. | Throws caught `TypeError` in standard Chromium / WebKit. | Polyfill `Selection.prototype.showHandles = function(){}` in custom bridge injection. |
| **Handwriting Paint** | Embeds `paint` nodes referencing `paintid`. | Vector ink engine (`libinkEngineNative.so`) is native C++ and non-portable. | Web/cross-platform rebuild should render canvas drawing or SVG preview for paint blocks. |
| **Slash Menu UI** | `showRichTextFormatMenu` fires bridge request. | Menu UI is 100% native COUI bottom sheet / popup; not rendered in web bundle. | Cross-platform shell must render custom popup menu at coordinates provided in request. |
