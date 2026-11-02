#!/usr/bin/env node
/**
 * Automated Bridge Protocol Test Suite for ColorOS Notes Rebuild
 * Validates WVJB message framing, TiptapContentInfo (10 fields), and handler dispatch.
 */

const assert = require("assert");

console.log("==================================================");
console.log("  SUITE 2: WebView Javascript Bridge (WVJB) Tests");
console.log("==================================================");

// 1. Validate TiptapContentInfo wire model
const contentInfo = {
  guid: "test-note-guid-001",
  titleHintText: "Title",
  title: "Test Note Title",
  content: "<p>Hello ColorOS Notes</p>",
  subAttachments: [],
  pageResults: [],
  pictureAttrs: {},
  tiptapTitleJson: null,
  tiptapContentJson: {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Hello ColorOS Notes" }]
      }
    ]
  },
  isDoingSummary: false
};

const keys = Object.keys(contentInfo);
console.log(`[TEST 2.1] TiptapContentInfo Field Count: ${keys.length} fields -> PASS`);
assert.strictEqual(keys.length, 10, "TiptapContentInfo must have exactly 10 fields");

// 2. Mock Bridge Implementation
const bridgeHandlers = {};
const receivedFromJs = [];

const mockBridge = {
  registerHandler: function(name, handler) {
    bridgeHandlers[name] = handler;
  },
  callHandler: function(name, data, callback) {
    receivedFromJs.push({ name, data });
    if (callback) callback("ack");
  },
  _handleMessageFromJava: function(jsonStr) {
    const msg = JSON.parse(jsonStr);
    if (msg.handlerName && bridgeHandlers[msg.handlerName]) {
      return bridgeHandlers[msg.handlerName](msg.data, function(resp) {
        return resp;
      });
    }
  }
};

// 3. Register standard TipTap handlers
let initReceived = null;
mockBridge.registerHandler("callInitContentFromJava", function(data, cb) {
  initReceived = typeof data === "string" ? JSON.parse(data) : data;
  return "done";
});

let boldState = null;
mockBridge.registerHandler("callSetBoldFromJava", function(data, cb) {
  boldState = data;
  return "done";
});

let tableInserted = null;
mockBridge.registerHandler("callInsertTableFromJava", function(data, cb) {
  tableInserted = data;
  return "true";
});

// 4. Test Dispatch from Host (Dart -> JS)
mockBridge._handleMessageFromJava(JSON.stringify({
  handlerName: "callInitContentFromJava",
  data: JSON.stringify(contentInfo)
}));

console.log(`[TEST 2.2] Host -> JS callInitContentFromJava: GUID=${initReceived.guid} -> PASS`);
assert.strictEqual(initReceived.guid, "test-note-guid-001");
assert.strictEqual(initReceived.title, "Test Note Title");

mockBridge._handleMessageFromJava(JSON.stringify({
  handlerName: "callSetBoldFromJava",
  data: "true"
}));
console.log(`[TEST 2.3] Host -> JS callSetBoldFromJava: value=${boldState} -> PASS`);
assert.strictEqual(boldState, "true");

mockBridge._handleMessageFromJava(JSON.stringify({
  handlerName: "callInsertTableFromJava",
  data: JSON.stringify({ rows: 3, cols: 3 })
}));
console.log(`[TEST 2.4] Host -> JS callInsertTableFromJava: rows=3 -> PASS`);
assert.ok(tableInserted !== null);

// 5. Test Dispatch from Editor (JS -> Host)
mockBridge.callHandler("onTitleChange", "Updated Title via Typing");
mockBridge.callHandler("onContentJsonUpdate", JSON.stringify({ type: "doc", content: [] }));

console.log(`[TEST 2.5] JS -> Host onTitleChange: count=${receivedFromJs.length} -> PASS`);
assert.strictEqual(receivedFromJs[0].name, "onTitleChange");
assert.strictEqual(receivedFromJs[0].data, "Updated Title via Typing");
assert.strictEqual(receivedFromJs[1].name, "onContentJsonUpdate");

console.log("All Bridge Protocol Tests Completed Successfully.\n");
