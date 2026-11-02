/**
 * probe_calls.mjs — fire additional native->JS handlers against the live harness
 * and record real callback responses (contract verification beyond the 15 tests).
 *
 * Usage: node probe_calls.mjs   (spawns server.js + helium headless, writes results/probe_calls.json)
 */
import { CDP, waitFor } from './cdp.mjs';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BASE = 'http://127.0.0.1:8765/';
const CDP_PORT = 9335;

const server = spawn('node', [path.join(HERE, 'server.js')], { stdio: ['ignore', 'ignore', 'inherit'] });
const profile = path.join('/tmp/opencode', 'helium-probe-calls-' + Date.now());
fs.mkdirSync(profile, { recursive: true });
const browser = spawn('/usr/bin/helium-browser', [
  '--headless', `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', '--disable-extensions',
  '--window-size=412,915', 'about:blank',
], { stdio: ['ignore', 'ignore', 'ignore'] });

const results = { ran_at: new Date().toISOString(), browser: null, calls: [], sync_iface: [], console_errors: [] };

function log(...a) { console.log(...a); }

try {
  const ver = await waitFor(async () => {
    try { return await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`)).json(); } catch { return null; }
  }, 25000, 300);
  if (!ver) throw new Error('CDP endpoint did not come up');
  results.browser = ver.Browser;

  let target;
  try {
    const r = await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?${encodeURIComponent(BASE)}`, { method: 'PUT' });
    if (r.ok) target = await r.json();
  } catch {}
  if (!target) {
    const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
    target = list.find((t) => t.type === 'page');
  }

  const cdp = await new CDP(target.webSocketDebuggerUrl).connect();
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Log.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 412, height: 915, deviceScaleFactor: 2, mobile: true });
  if (!target.url || target.url === 'about:blank') await cdp.send('Page.navigate', { url: BASE });

  cdp.on((m) => {
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails;
      results.console_errors.push((d.exception && d.exception.description) || d.text);
    }
  });

  await waitFor(async () => {
    const r = await cdp.send('Runtime.evaluate', { expression: "document.readyState==='complete'", returnByValue: true });
    return r.result.value;
  }, 20000, 250);
  // wait for harness flags: attach + css + uiMode all applied
  const ready = await waitFor(async () => {
    const r = await cdp.send('Runtime.evaluate', {
      expression: "!!(window.__smoke && window.__smoke.flags.basicCssApplied && window.__smoke.flags.uiModeApplied && window.__smoke.flags.tipTapMounted>0)",
      returnByValue: true,
    });
    return r.result.value;
  }, 15000, 300);
  if (!ready) throw new Error('harness flags never became ready');
  await new Promise((r) => setTimeout(r, 500));

  const ev = async (expr) => {
    const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) return { __ex: (r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text };
    return r.result.value;
  };

  // ── give the editor real content + a selection to query ────────────────────
  await ev(`(function(){var pm=document.querySelector('.ProseMirror'); pm.focus();
    var sel=window.getSelection(), r=document.createRange(); r.selectNodeContents(pm); sel.removeAllRanges(); sel.addRange(r); return 'ok';})()`);
  await ev(`document.execCommand('insertText', false, 'Probe line one\\nProbe line two')`);
  await new Promise((r) => setTimeout(r, 400));
  await ev(`(function(){var pm=document.querySelector('.ProseMirror'); pm.focus();
    var sel=window.getSelection(), r=document.createRange(); r.selectNodeContents(pm.firstElementChild); sel.removeAllRanges(); sel.addRange(r); return 'ok';})()`);

  // ── native->JS query/ack handlers (payloads mirror native call sites) ──────
  const batch = [
    ['callGetTextAndHtmlFromJava', null],
    ['callGetAllHTMLFromJava', null],
    ['callGetSelectedBlockFromJava', null],
    ['callGetFocusedEditorFromJava', null],
    ['callGetEditorsHeightFromJava', null],
    ['callGetBlockContentWidthFromJava', null],
    ['callGetCursorStartPosition', null],
    ['callGetSelectionCoordsAndHasMarks', null],
    ['callGetHasLinkCard', null],
    ['callGetSelectTextFromJava', null],
    ['callGetAttachmentsFromJava', null],
    ['callGetPaintAttachmentFromJava', null],
    ['callNotifyIdleFromJava', '0'],
    ['callSetBoldFromJava', 'true'],        // native sends String.valueOf(boolean)
    ['callSetBoldFromJava', 'false'],
    ['callSetTextSelectionAllFromJava', 'true'],
    ['callSetUiModeFromJava', '1'],         // VIEW: observable via parent class
    ['callSetUiModeFromJava', '3'],         // back to EDIT
    ['callInsertTableFromJava', ''],
    ['callAddRowInTableFromJava', ''],
    ['callRemoveRowInTableFromJava', ''],
    ['callUndoFromJava', ''],
    ['callRedoFromJava', ''],
    ['callSetDensityScaleFromJava', '1.0'],
    ['callSetEditorScaleFromJava', '1.0'],
    ['callLoadFontListFromJava', '[]'],
  ];

  for (const [name, data] of batch) {
    const t0 = Date.now();
    const cb = await ev(`window.__smokeSend(${JSON.stringify(name)}, ${data === null ? 'null' : JSON.stringify(data)})`);
    const resp = cb && cb !== '__BRIDGE_NOT_READY__'
      ? await ev(`window.__smokeResponse(${JSON.stringify(cb)}, 4000)`)
      : { ok: false, not_ready: true };
    const entry = { handler: name, data, response: resp, ms: Date.now() - t0 };
    results.calls.push(entry);
    log(`${resp && resp.ok ? 'OK  ' : 'TO  '} ${name.padEnd(42)} ${JSON.stringify(resp).slice(0, 140)}`);
    await new Promise((r) => setTimeout(r, 120));
  }

  // ── synchronous injectedObject contracts (mock returns; device impl differs) ─
  const sync = await ev(`JSON.stringify({
    isNewTblVersion: window.injectedObject.isNewTblVersion(),
    isImeVisible: window.injectedObject.isImeVisible(),
    isExport: window.injectedObject.isExport(),
    getAIGCCount: window.injectedObject.getAIGCCount(1),
    checkInCall: window.injectedObject.checkInCall(),
    isOverScrolling: window.injectedObject.isOverScrolling(),
    isBlockHorizontalSlidingDisable: window.injectedObject.isBlockHorizontalSlidingDisable(),
  })`);
  results.sync_iface = JSON.parse(sync || '{}');
  log('sync interface returns:', sync);

  // ── capture the roundtrip payloads in full ────────────────────────────────
  const full = await ev(`(function(){
    var r = null;
    return window.__smokeResponse((function(){
      var cb = window.__smokeSend('callGetTextAndHtmlFromJava', null);
      return cb;
    })(), 4000).then(function(x){ return JSON.stringify(x); });
  })()`);
  try { results.full_text_and_html = JSON.parse(full).data; } catch { results.full_text_and_html = full; }

  fs.mkdirSync(path.join(HERE, 'results'), { recursive: true });
  fs.writeFileSync(path.join(HERE, 'results', 'probe_calls.json'), JSON.stringify(results, null, 1));
  log(`\nwrote results/probe_calls.json — ${results.calls.length} calls, ${results.calls.filter(c=>c.response&&c.response.ok).length} responded, ${results.console_errors.length} page exceptions`);

  cdp.close();
} finally {
  try { browser.kill('SIGTERM'); } catch {}
  try { server.kill('SIGTERM'); } catch {}
}
