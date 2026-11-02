/**
 * bridge_host.js — harness capture layer.
 *
 * Loads AFTER /vendor/mock_bridge.js (the existing, unmodified mock from rea-tools/)
 * and BEFORE the production module. It does not replace the mock; it wraps it to:
 *
 *   1. Record every injectedObject callback invocation (which host methods the
 *      production bundle actually calls, and how often).
 *   2. Capture outbound WVJB messages (window.WVJBInterface.notice) and resolve
 *      native<->JS callback replies ({responseId, responseData}).
 *   3. Track lifecycle flags (onAppVueMounted, onTipTapMounted).
 *   4. Add the one interface method the mock lacks: boolean isExport() -> false
 *      (verified absent: interface IMyJavascriptInterface has 105 methods,
 *       rea-tools/mock_bridge.js covers 104).
 *   5. Expose driver helpers: __smokeSend (java->js message with callbackId),
 *      __smokeResponse (await a callback reply), __smokeReset.
 *
 * All state lives on window.__smoke for evaluation from the CDP driver.
 */
'use strict';

(function () {
  var S = (window.__smoke = {
    notices: [],          // raw outbound strings seen by WVJBInterface.notice
    noticeParsed: [],     // parsed outbound messages
    responses: {},        // callbackId -> responseData (JS replies to java)
    pendingJava: {},      // callbackId -> handlerName (messages WE sent into JS)
    calls: [],            // injectedObject method-name call log
    callCounts: {},       // method-name -> count
    unknownCalls: [],     // calls to methods NOT defined by the mock
    flags: { appVueMounted: 0, tipTapMounted: 0, attachSent: false },
    errors: [],           // window.onerror / unhandledrejection
  });

  function pushCall(name) {
    S.calls.push(name);
    S.callCounts[name] = (S.callCounts[name] || 0) + 1;
  }

  // ── 1. WVJBInterface.notice capture wrapper ────────────────────────────────
  var wvjb = window.WVJBInterface;
  if (!wvjb || typeof wvjb.notice !== 'function') {
    S.errors.push('bridge_host: window.WVJBInterface.notice missing — mock did not install');
  } else {
    var origNotice = wvjb.notice;
    wvjb.notice = function (str) {
      try {
        var raw = typeof str === 'string' ? str : String(str);
        S.notices.push(raw);
        var msg = JSON.parse(raw);
        S.noticeParsed.push(msg);
        if (msg.responseId !== undefined && msg.responseId !== null) {
          S.responses[msg.responseId] = msg.responseData;
        }
      } catch (e) {
        S.errors.push('bridge_host: notice parse error: ' + e.message);
      }
      return origNotice.call(wvjb, str);
    };
  }

  // ── 2. injectedObject instrumentation + missing isExport ───────────────────
  var io = window.injectedObject;
  if (!io) {
    S.errors.push('bridge_host: window.injectedObject missing — mock did not install');
  } else {
    if (typeof io.isExport !== 'function') {
      io.isExport = function () { return false; }; // boolean per IMyJavascriptInterface
    }
    Object.keys(io).forEach(function (k) {
      if (typeof io[k] !== 'function') return;
      var orig = io[k];
      io[k] = function () {
        pushCall(k);
        return orig.apply(this, arguments);
      };
    });
  }

  // ── 3. lifecycle flags ─────────────────────────────────────────────────────
  var av = window.injectedAppVueObject;
  if (av && typeof av.onAppVueMounted === 'function') {
    var origAppVue = av.onAppVueMounted;
    av.onAppVueMounted = function () {
      S.flags.appVueMounted++;
      return origAppVue.apply(this, arguments);
    };
  }
  if (io && typeof io.onTipTapMounted === 'function') {
    var origTT = io.onTipTapMounted;
    io.onTipTapMounted = function () {
      S.flags.tipTapMounted++;
      return origTT.apply(this, arguments);
    };
  }

  // ── 4. page error capture (complements CDP Runtime events) ─────────────────
  window.addEventListener('error', function (e) {
    S.errors.push('window.onerror: ' + (e.message || e.type) + ' @ ' + (e.filename || '') + ':' + (e.lineno || ''));
  });
  window.addEventListener('unhandledrejection', function (e) {
    S.errors.push('unhandledrejection: ' + String(e.reason && e.reason.stack ? e.reason.stack : e.reason));
  });

  // ── 5. driver helpers ──────────────────────────────────────────────────────
  window.__smokeSend = function (handlerName, data, callbackId) {
    var bridge = window.WebViewJavascriptBridge;
    if (!bridge || typeof bridge._handleMessageFromJava !== 'function') {
      return '__BRIDGE_NOT_READY__';
    }
    var cb = callbackId || 'java_cb_smoke_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
    var msg = {
      handlerName: handlerName,
      data: data == null ? '' : (typeof data === 'string' ? data : JSON.stringify(data)),
      callbackId: cb,
    };
    S.pendingJava[cb] = handlerName;
    bridge._handleMessageFromJava(msg);
    return cb;
  };

  window.__smokeResponse = function (callbackId, timeoutMs) {
    var timeout = timeoutMs || 3000;
    return new Promise(function (resolve) {
      var t0 = Date.now();
      var iv = setInterval(function () {
        if (Object.prototype.hasOwnProperty.call(S.responses, callbackId)) {
          clearInterval(iv);
          resolve({ ok: true, data: S.responses[callbackId] });
        } else if (Date.now() - t0 > timeout) {
          clearInterval(iv);
          resolve({ ok: false, timeout: true });
        }
      }, 40);
    });
  };

  window.__smokeState = function () {
    return JSON.parse(JSON.stringify({
      flags: S.flags,
      callCounts: S.callCounts,
      errorCount: S.errors.length,
      errors: S.errors.slice(-10),
      noticeCount: S.notices.length,
      responseCount: Object.keys(S.responses).length,
    }));
  };

  // ── 6. native attach sequence ──────────────────────────────────────────────
  // Verified in production bundle (App.vue): registerHandler("callAttachTipTapFromJava")
  // sets an internal ref `n.value = (data === "true")` that gates the TipTap
  // editor component's v-if. In the real app the Android host sends this AFTER
  // page load; without it the app stays on the loading spinner and NONE of the
  // editor-level handlers (callInitContentFromJava, callSetBoldFromJava, ...)
  // ever register. The mock bridge does not send it, so the harness must.
  var attachTimer = setInterval(function () {
    if (window.WebViewJavascriptBridge && S.flags.appVueMounted > 0) {
      clearInterval(attachTimer);
      setTimeout(function () {
        var cb = window.__smokeSend('callAttachTipTapFromJava', 'true');
        S.flags.attachSent = cb !== '__BRIDGE_NOT_READY__';
        console.log('[bridge_host] injected callAttachTipTapFromJava=true (' + cb + ')');
      }, 250);
    }
  }, 100);

  // ── 7. BasicCssParams injection (themeColors) ─────────────────────────────
  // Without themeColors, S.themeColors.value stays null and the bundle throws
  // on every selection change: "Cannot read properties of null (reading
  // 'textColorHighlight')" (index.js:525 onSelectionDebounce -> index.js:13).
  // The handler registers inside kP(), which runs during TipTap editor setup
  // (AFTER appVueMounted, together with onTipTapMounted), so we wait for the
  // tipTapMounted flag and retry until KM() logs "setBasicCssParams:" — that
  // log proves the handler ran.
  var origConsoleLog = console.log;
  console.log = function () {
    try {
      for (var ai = 0; ai < arguments.length; ai++) {
        if (typeof arguments[ai] === 'string') {
          if (arguments[ai].indexOf('setBasicCssParams') >= 0) S.flags.basicCssApplied = true;
          if (arguments[ai].indexOf('setUiMode:') >= 0) S.flags.uiModeApplied = true;
        }
      }
    } catch (e) {}
    return origConsoleLog.apply(console, arguments);
  };

  var cssPayload = JSON.stringify({
    dir: 'ltr',
    titleFontWght: 400,
    contentFontWght: 400,
    boldContentFontWght: 700,
    textThickness: 0,
    isQuickNote: false,
    themeColors: {
      textColorHighlight: '#FED044',
      couiColorPrimary: 'rgba(255,178,0,1)',
      couiColorPrimaryText: '#FFB200',
      couiColorLabelOnColor: '#FFFFFF',
      couiColorLabelTertiary: '#00000042',
      couiColorContainer16: '#00000029',
      couiColorContainerTheme: '#FFB200',
      couiColorFocus: '#FFB2001F'
    }
  });
  var cssTries = 0;
  var cssTimer = setInterval(function () {
    var cssDone = S.flags.basicCssApplied;
    var uiDone = S.flags.uiModeApplied;
    if ((cssDone && uiDone) || cssTries >= 40) {
      clearInterval(cssTimer);
      if (!cssDone) S.errors.push('bridge_host: callSetBasicCssParamsFromJava never applied after ' + cssTries + ' tries');
      if (!uiDone) S.errors.push('bridge_host: callSetUiModeFromJava never applied after ' + cssTries + ' tries');
      return;
    }
    if (!window.WebViewJavascriptBridge || !(S.flags.tipTapMounted > 0)) return;
    cssTries++;
    S.flags.basicCssSentTries = cssTries;
    if (!cssDone) {
      var cb = window.__smokeSend('callSetBasicCssParamsFromJava', cssPayload);
      if (cb !== '__BRIDGE_NOT_READY__') S.flags.basicCssSent = true;
    }
    // The host also switches the editor into edit mode ("3" = EDITOR_UI_MODE_EDIT,
    // "1" = VIEW). The bundle boots in VIEW mode, which adds class
    // hide-placeholder to empty blocks (::before opacity:0) — the blank-note
    // placeholder never paints without this message.
    if (!uiDone) {
      var cb2 = window.__smokeSend('callSetUiModeFromJava', '3');
      if (cb2 !== '__BRIDGE_NOT_READY__') S.flags.uiModeSent = true;
    }
  }, 50); // 50ms: must beat the editor's initial selection debounce (SELECTION_DELAY_TIME), which throws textColorHighlight when themeColors is still null

  console.log('[bridge_host] capture layer installed over mock bridge');
})();
