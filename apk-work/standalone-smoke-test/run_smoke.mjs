/**
 * run_smoke.mjs — executes the standalone ColorOS Notes editor smoke test.
 *
 * Flow: server.js -> helium (Chromium 156, headless, CDP) -> harness.html
 *       -> production bundle boots over the mock bridge -> 15 tests -> results/
 *
 * Zero external dependencies (Node built-in WebSocket/fetch/child_process).
 * Honesty rule: every PASS carries observed evidence; failures record actual
 * console/network output. Untestable steps are marked NOT TESTED, never skipped.
 */
import { CDP, waitFor } from './cdp.mjs';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RESULTS = path.join(HERE, 'results');
fs.mkdirSync(RESULTS, { recursive: true });

const HTTP_PORT = 8765;
const CDP_PORT = 9333;
const BASE = `http://127.0.0.1:${HTTP_PORT}/`;
const HELIUM = '/usr/bin/helium-browser';

const T0 = Date.now();
const ts = () => `+${((Date.now() - T0) / 1000).toFixed(1)}s`;
const log = (...a) => console.log(`[${ts()}]`, ...a);

// ── result state ─────────────────────────────────────────────────────────────
const tests = [];
const consoleTranscript = [];
const consoleErrors = [];
const netFailures = [];
let lastError = null;

function T(id, name, status, attempt, observed, evidence = []) {
  tests.push({ id, name, status, attempt, observed, evidence });
  log(`${status.padEnd(10)} #${id} ${name} :: ${observed}`);
}

let server = null, browser = null, cdp = null;
let browserLog = '';

async function main() {
  try {
  // ── 1. static server ───────────────────────────────────────────────────────
  log('starting server.js ...');
  server = spawn('node', [path.join(HERE, 'server.js')], { stdio: ['ignore', 'pipe', 'pipe'] });
  server.stdout.on('data', (d) => log('[server]', d.toString().trim()));
  server.stderr.on('data', (d) => log('[server:err]', d.toString().trim()));
  const up = await waitFor(async () => {
    try { const r = await fetch(BASE); return r.ok; } catch { return false; }
  }, 8000, 200, 'server');
  if (!up) throw new Error('server.js did not come up');

  // ── 2. headless Chromium (Helium) ──────────────────────────────────────────
  const profile = path.join('/tmp/opencode', 'helium-smoke-' + Date.now());
  fs.mkdirSync(profile, { recursive: true });
  log('launching helium (Chromium) headless, CDP :' + CDP_PORT);
  browser = spawn(HELIUM, [
    '--headless',
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--disable-extensions',
    '--disable-background-networking', '--disable-component-update',
    '--no-service-control', '--hide-scrollbars', '--mute-audio',
    '--window-size=412,915', 'about:blank',
  ], { stdio: ['ignore', 'pipe', 'pipe'] });
  browser.stdout.on('data', (d) => { browserLog += d; });
  browser.stderr.on('data', (d) => { browserLog += d; });

  const ver = await waitFor(async () => {
    try { const r = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`); return await r.json(); } catch { return null; }
  }, 25000, 300, 'cdp');
  if (!ver) throw new Error('CDP endpoint never came up');
  log('browser up:', ver.Browser);

  // open a page target directly at the harness URL
  let target = null;
  try {
    const r = await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?${encodeURIComponent(BASE)}`, { method: 'PUT' });
    if (r.ok) target = await r.json();
  } catch {}
  if (!target) {
    const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
    target = list.find((t) => t.type === 'page');
    if (target) {
      // navigate manually later
    } else {
      const r = await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?${encodeURIComponent(BASE)}`);
      target = await r.json();
    }
  }
  log('target:', target.id, target.url || '(created)');

  cdp = await new CDP(target.webSocketDebuggerUrl).connect();

  // ── 3. enable domains + collectors ─────────────────────────────────────────
  cdp.on((m) => {
    if (m.method === 'Runtime.consoleAPICalled') {
      const txt = m.params.args.map((a) => a.value !== undefined ? String(a.value) : (a.description || a.type)).join(' ');
      consoleTranscript.push(`${m.params.type}: ${txt}`);
      if (m.params.type === 'error') consoleErrors.push(txt);
    } else if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails;
      const txt = (d.exception && (d.exception.description || d.exception.value)) || d.text;
      consoleErrors.push('EXCEPTION: ' + String(txt));
    } else if (m.method === 'Log.entryAdded') {
      const e = m.params.entry;
      const txt = `[log.${e.level}] ${e.text}${e.url ? ' @ ' + e.url : ''}`;
      consoleTranscript.push(txt);
      if (e.level === 'error') consoleErrors.push(txt);
    } else if (m.method === 'Network.responseReceived') {
      const { response } = m.params;
      if (response.status >= 400) netFailures.push(`${response.status} ${response.url}`);
    } else if (m.method === 'Network.loadingFailed') {
      const p = m.params;
      if (!p.canceled) netFailures.push(`FAILED ${p.errorText} ${p.type} requestId=${p.requestId}`);
    }
  });
  await Promise.all([
    cdp.send('Page.enable'), cdp.send('Runtime.enable'),
    cdp.send('Log.enable'), cdp.send('Network.enable'),
  ]);
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 412, height: 915, deviceScaleFactor: 2, mobile: true,
  });

  const ev = async (expression, awaitPromise = false) => {
    const r = await cdp.send('Runtime.evaluate', {
      expression, awaitPromise, returnByValue: true, userGesture: true,
    });
    if (r.exceptionDetails) {
      return { __ex: (r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text };
    }
    return r.result.value;
  };

  const shot = async (name) => {
    try {
      const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(RESULTS, `${name}.png`), Buffer.from(data, 'base64'));
      log(`screenshot: results/${name}.png`);
      return `results/${name}.png`;
    } catch (e) { return 'screenshot failed: ' + e.message; }
  };

  const key = async (type, k, code, vk, modifiers) =>
    cdp.send('Input.dispatchKeyEvent', { type, key: k, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers });
  const chord = async (modifiers, k, code, vk) => {
    await key('rawKeyDown', k, code, vk, modifiers);
    await key('keyUp', k, code, vk, modifiers);
  };
  const typeText = (t) => ev(`document.execCommand('insertText', false, ${JSON.stringify(t)})`);
  const focusBody = () => ev(`(function(){
    var ed = document.querySelector('.ProseMirror');
    if (!ed) return 'no-editor';
    ed.focus();
    var sel = window.getSelection(), r = document.createRange();
    r.selectNodeContents(ed); r.collapse(false);
    sel.removeAllRanges(); sel.addRange(r);
    return 'focused-end';
  })()`);
  const selectAllBody = () => ev(`(function(){
    var ed = document.querySelector('.ProseMirror');
    if (!ed) return 'no-editor';
    ed.focus();
    var sel = window.getSelection(), r = document.createRange();
    r.selectNodeContents(ed);
    sel.removeAllRanges(); sel.addRange(r);
    return 'selected';
  })()`);

  // ── 4. navigate & load ─────────────────────────────────────────────────────
  log('navigating to harness:', BASE);
  if (!target.url || target.url === 'about:blank') await cdp.send('Page.navigate', { url: BASE });
  else if (target.url !== BASE) await cdp.send('Page.navigate', { url: BASE });

  const ready = await waitFor(() => ev("document.readyState === 'complete' ? 1 : 0"), 20000, 250, 'ready');
  await new Promise((r) => setTimeout(r, 1500)); // let module chunks boot

  // ═══════════════ TEST 1 — application startup ═══════════════
  // readyState=complete fires before Vue finishes its first render; poll briefly.
  const t1 = await waitFor(async () => {
    const raw = await ev(`JSON.stringify({
      ready: document.readyState, href: location.href,
      app: !!document.querySelector('#app'), bodyLen: document.body.innerHTML.length,
      hasRootChildren: (document.querySelector('#app')||{children:[]}).children.length
    })`);
    try { const s = JSON.parse(raw); return s.ready === 'complete' && s.app && s.hasRootChildren > 0 ? s : null; } catch { return null; }
  }, 10000, 300, 'startup');
  if (t1) {
    T(1, 'Application startup', 'PASS',
      `loaded ${BASE}, polled readyState + first render`,
      `readyState=${t1.ready}, #app present=${t1.app}, #app children=${t1.hasRootChildren}, body HTML ${t1.bodyLen} chars`,
      [`href=${t1.href}`]);
  } else {
    T(1, 'Application startup', 'FAIL', 'polled 10s for first render', '#app never got children', []);
  }

  // ═══════════════ TEST 2 — Vue mounting ═══════════════
  const vueOk = await waitFor(async () => {
    const v = await ev(`(function(){
      var el = document.querySelector('#app');
      if (!el) return 0;
      if (el.__vue_app__) return 2;
      return el.children.length && el.innerHTML.length > 3000 ? 1 : 0;
    })()`);
    return v === 1 || v === 2 ? v : 0;
  }, 15000, 300, 'vue');
  const flags2 = await ev('JSON.stringify(window.__smoke ? window.__smoke.flags : null)');
  T(2, 'Vue mounting', vueOk ? 'PASS' : 'FAIL',
    'poll for #app content / el.__vue_app__',
    vueOk ? `mounted (vue marker level ${vueOk}); appVueMounted flag: ${flags2}` : `not mounted after 15s; flags=${flags2}`,
    []);

  // ═══════════════ TEST 3 — TipTap initialization ═══════════════
  const tt = await waitFor(async () => {
    const v = await ev(`(function(){
      var pm = document.querySelector('.ProseMirror');
      var f = window.__smoke && window.__smoke.flags.tipTapMounted;
      return (pm && pm.isContentEditable && f) ? {len: pm.innerHTML.length, mounted: f} : 0;
    })()`);
    return v || 0;
  }, 20000, 300, 'tiptap');
  if (tt) {
    const pmHtml = await ev(`document.querySelector('.ProseMirror').outerHTML.slice(0,300)`);
    T(3, 'TipTap initialization', 'PASS', 'wait for contenteditable .ProseMirror + onTipTapMounted',
      `editor attached (${tt.len} chars HTML), onTipTapMounted fired x${tt.mounted}`, [String(pmHtml)]);
  } else {
    const pm = await ev(`!!document.querySelector('.ProseMirror')`);
    T(3, 'TipTap initialization', 'FAIL', 'wait 20s for .ProseMirror + flag',
      `editor=${pm}; flags=${await ev('JSON.stringify(window.__smoke&&window.__smoke.flags)')}`, []);
  }

  // ═══════════════ TEST 4 — blank-note initialization ═══════════════
  await new Promise((r) => setTimeout(r, 2000));
  const t4 = await ev(`JSON.stringify({
    text: (document.querySelector('.ProseMirror')||{innerText:''}).innerText,
    stored: localStorage.getItem('coloros_notes_tiptap_json'),
    initLog: (window.__smoke && window.__smoke.callCounts.onTipTapMounted) || 0
  })`);
  try {
    const s = JSON.parse(t4);
    const initSeen = consoleTranscript.some((l) => l.includes('callInitContentFromJava'));
    T(4, 'Blank-note initialization', s.text.trim() === '' && initSeen ? 'PASS' : (s.text.trim() === '' ? 'PARTIAL' : 'FAIL'),
      'fresh profile -> mock auto-sends callInitContentFromJava on onTipTapMounted',
      `editor text empty=${s.text.trim() === ''}; init log seen in console=${initSeen}; localStorage=${s.stored === null ? 'null (fresh)' : 'present'}`,
      consoleTranscript.filter((l) => l.includes('callInitContent')).slice(0, 3));
  } catch { T(4, 'Blank-note initialization', 'FAIL', 'evaluate', String(t4)); }
  // The empty-block placeholder (div.is-empty -> p:before content:attr)
  // is a CustomPlaceholder PM decoration that only paints for the CURRENT
  // block — focus the editor and put the caret in the first block, the way a
  // real note open does, so the screenshot shows the placeholder.
  await ev(`(function(){
    var pm=document.querySelector('.ProseMirror'); if(!pm) return 'no-editor';
    pm.focus();
    var first=pm.firstElementChild;
    var sel=window.getSelection(), r=document.createRange();
    if(first){ r.selectNodeContents(first); r.collapse(true); } else { r.selectNodeContents(pm); }
    sel.removeAllRanges(); sel.addRange(r);
    return 'ok';
  })()`);
  await new Promise((r) => setTimeout(r, 700));
  const shotBoot = await shot('01_boot');

  // ═══════════════ TEST 5 — typing and editing ═══════════════
  await focusBody();
  const f5 = await ev(`document.activeElement && document.activeElement.className`);
  const typeOk = await typeText('Hello ColorOS Notes — standalone smoke test.');
  await new Promise((r) => setTimeout(r, 600));
  const t5 = await ev(`(document.querySelector('.ProseMirror')||{innerText:''}).innerText`);
  T(5, 'Typing and editing', String(t5).includes('Hello ColorOS Notes') ? 'PASS' : 'FAIL',
    `focus .ProseMirror (activeElement=${f5}), execCommand('insertText') — native path`,
    `execCommand returned ${String(typeOk)}; editor text now: ${JSON.stringify(String(t5).slice(0, 120))}`);

  // ═══════════════ TEST 6 — title editing ═══════════════
  // Verified in the bundle: the web editor has NO separate title <input>.
  // The title is the first block styled by callSetTitleStyleFromJava ->
  // MultiHeading attribute multi-heading="1" (title) / "2" (subtitle) /
  // "3" (small_title); observeTitleText then reports it via onTitleChange.
  // DOM probe first (for the record):
  const titleProbe = await ev(`JSON.stringify({
    editables: Array.from(document.querySelectorAll('[contenteditable]')).map(function(e){
      return {cls:String(e.className).slice(0,70), ce:e.getAttribute('contenteditable'), txt:(e.innerText||'').slice(0,20)};}),
    inputs: document.querySelectorAll('input,textarea').length
  })`);
  const t6sel = await ev(`(function(){
    var pm=document.querySelector('.ProseMirror'); if(!pm) return 'no-editor';
    pm.focus();
    var target = pm.firstElementChild; if(!target) return 'no-first-block';
    var sel=window.getSelection(), r=document.createRange();
    r.selectNodeContents(target);
    sel.removeAllRanges(); sel.addRange(r);
    return target.tagName;
  })()`);
  const titleCallsBefore = await ev(`(window.__smoke.callCounts.onTitleChange)||0`);
  await ev(`window.__smokeSend('callSetTitleStyleFromJava', '{"titleStyle":"title","type":"title"}')`);
  await new Promise((r) => setTimeout(r, 500));
  const t6style = await ev(`JSON.stringify({
    attrs: Array.from(document.querySelectorAll('.ProseMirror [multi-heading]')).map(function(e){return e.tagName+':'+e.getAttribute('multi-heading');}).slice(0,6),
    firstBlock: (document.querySelector('.ProseMirror')||{}).firstElementChild ? document.querySelector('.ProseMirror').firstElementChild.outerHTML.slice(0,180) : ''
  })`);
  // re-select first block (the style chain runs focus commands) and type the title
  await ev(`(function(){
    var pm=document.querySelector('.ProseMirror');
    var target = pm && pm.firstElementChild; if(!target) return 'no-block';
    var sel=window.getSelection(), r=document.createRange();
    r.selectNodeContents(target); r.collapse(false);
    sel.removeAllRanges(); sel.addRange(r);
    return 'ok';
  })()`);
  const t6typed = await typeText('Smoke Note Title');
  await new Promise((r) => setTimeout(r, 900));
  const t6after = await ev(`JSON.stringify({
    firstText: (((document.querySelector('.ProseMirror')||{}).firstElementChild)||{innerText:''}).innerText.slice(0,60),
    titleCalls: (window.__smoke.callCounts.onTitleChange)||0
  })`);
  const titleLogLines = consoleTranscript.filter((l) => l.includes('onTitleChange')).slice(-3);
  let styleApplied = false, firstTextOk = false, titleCalls = { before: titleCallsBefore, after: 0 }, firstTextSnippet = '';
  try {
    const st = JSON.parse(t6style);
    styleApplied = st.attrs.some((a) => a.endsWith(':1'));
  } catch {}
  try {
    const af = JSON.parse(t6after);
    firstTextSnippet = String(af.firstText || '');
    firstTextOk = firstTextSnippet.includes('Smoke Note Title');
    titleCalls.after = af.titleCalls;
  } catch {}
  const titleCallbackFired = titleCalls.after > titleCalls.before;
  T(6, 'Title editing',
    (styleApplied && firstTextOk && titleCallbackFired) ? 'PASS' : (styleApplied && firstTextOk ? 'PARTIAL' : 'FAIL'),
    'select first block -> bridge callSetTitleStyleFromJava {type:"title"} -> type title text',
    `DOM probe=${String(titleProbe).slice(0, 300)}; selected tag=${t6sel}; multi-heading attrs=${String(t6style).slice(0, 300)}; typed ok=${String(t6typed)}; firstBlock text=${JSON.stringify(firstTextSnippet)}; onTitleChange calls ${titleCalls.before} -> ${titleCalls.after}`,
    titleLogLines);

  // ═══════════════ TEST 7 — bold and italic ═══════════════
  await selectAllBody();
  await chord(2, 'b', 'KeyB', 66); // Ctrl+B
  await new Promise((r) => setTimeout(r, 300));
  let boldVia = 'keyboard';
  let boldOk = await ev(`!!document.querySelector('.ProseMirror strong, .ProseMirror b')`);
  if (!boldOk) { // fallback: native toolbar path through bridge
    await ev(`window.__smokeSend('callSetBoldFromJava', '{}')`);
    await new Promise((r) => setTimeout(r, 400));
    boldOk = await ev(`!!document.querySelector('.ProseMirror strong, .ProseMirror b')`);
    boldVia = boldOk ? 'bridge callSetBoldFromJava(data="{}")' : 'failed: keyboard AND bridge';
  }
  const boldHtml = await ev(`(function(){var e=document.querySelector('.ProseMirror strong, .ProseMirror b');return e?e.outerHTML.slice(0,120):''})()`);

  await selectAllBody();
  await chord(2, 'i', 'KeyI', 73); // Ctrl+I
  await new Promise((r) => setTimeout(r, 300));
  let italVia = 'keyboard';
  let italOk = await ev(`!!document.querySelector('.ProseMirror em, .ProseMirror i')`);
  if (!italOk) {
    await ev(`window.__smokeSend('callSetItalicFromJava', '{}')`);
    await new Promise((r) => setTimeout(r, 400));
    italOk = await ev(`!!document.querySelector('.ProseMirror em, .ProseMirror i')`);
    italVia = italOk ? 'bridge callSetItalicFromJava(data="{}")' : 'failed: keyboard AND bridge';
  }
  const italHtml = await ev(`(function(){var e=document.querySelector('.ProseMirror em, .ProseMirror i');return e?e.outerHTML.slice(0,120):''})()`);
  T(7, 'Bold and italic', boldOk && italOk ? 'PASS' : (boldOk || italOk ? 'PARTIAL' : 'FAIL'),
    'select all body, Ctrl+B then Ctrl+I; bridge fallback if keymap missing',
    `bold=${boldOk ? 'applied via ' + boldVia : 'FAILED'}; italic=${italOk ? 'applied via ' + italVia : 'FAILED'}`,
    [boldHtml, italHtml].filter(Boolean));

  // ═══════════════ TEST 8 — headings ═══════════════
  // Verified in the bundle: there is NO h1-h6 path in this build (no
  // setHeading/toggleHeading callers anywhere in index.js). Headings are the
  // MultiHeading extension: paragraph/listItem attribute multi-heading
  // "1"|"2"|"3", applied by callSetTitleStyleFromJava with
  // {titleStyle, type} where type = "title"|"subtitle"|"small_title".
  // The slash menu renders NATIVE: '/' -> CustomSuggestion ->
  // showRichTextFormatMenu(query, clientRect) request to the host.
  const slashBefore = await ev(`(window.__smoke.callCounts.showRichTextFormatMenu)||0`);
  const slashTarget = await ev(`(function(){
    var pm=document.querySelector('.ProseMirror'); if(!pm) return 'no-editor';
    pm.focus();
    var ps=pm.querySelectorAll('p'), target=null;
    for (var i=0;i<ps.length;i++){ if(!ps[i].textContent.trim()){ target=ps[i]; break; } }
    if(!target) target=pm.firstElementChild;
    var sel=window.getSelection(), r=document.createRange();
    r.selectNodeContents(target); r.collapse(true);
    sel.removeAllRanges(); sel.addRange(r);
    return target?target.tagName:'none';
  })()`);
  await typeText('/');
  await new Promise((r) => setTimeout(r, 900));
  const slashAfter = await ev(`(window.__smoke.callCounts.showRichTextFormatMenu)||0`);
  const slashLogSeen = consoleTranscript.some((l) => l.includes('CustomSuggestion-Start'));
  // remove the '/' again so it does not pollute later tests
  await chord(2, 'z', 'KeyZ', 90);
  await new Promise((r) => setTimeout(r, 300));
  // heading application: select first non-empty block, apply subtitle (level 2)
  const headSel = await ev(`(function(){
    var pm=document.querySelector('.ProseMirror'); if(!pm) return 'no-editor';
    pm.focus();
    var ps=pm.querySelectorAll('p,li'), target=null;
    for (var i=0;i<ps.length;i++){ if((ps[i].textContent||'').indexOf('Hello ColorOS')>=0){ target=ps[i]; break; } }
    if(!target) for (var j=0;j<ps.length;j++){ if(ps[j].textContent.trim()){ target=ps[j]; break; } }
    if(!target) target=pm.firstElementChild;
    var sel=window.getSelection(), r=document.createRange();
    r.selectNodeContents(target);
    sel.removeAllRanges(); sel.addRange(r);
    return target?target.tagName+':'+(target.textContent||'').slice(0,20):'none';
  })()`);
  await ev(`window.__smokeSend('callSetTitleStyleFromJava', '{"titleStyle":"subtitle","type":"subtitle"}')`);
  await new Promise((r) => setTimeout(r, 700));
  const headCheck = await ev(`JSON.stringify({
    attrs: Array.from(document.querySelectorAll('.ProseMirror [multi-heading]')).map(function(e){return e.tagName+':'+e.getAttribute('multi-heading');}).slice(0,8),
    h1h3: document.querySelectorAll('.ProseMirror h1,.ProseMirror h2,.ProseMirror h3').length
  })`);
  let level2Applied = false, attrsNow = [], h1h3Count = '?';
  try {
    const hc = JSON.parse(headCheck);
    attrsNow = hc.attrs;
    h1h3Count = hc.h1h3;
    level2Applied = hc.attrs.some((a) => a.endsWith(':2'));
  } catch {}
  const slashFired = slashAfter > slashBefore || slashLogSeen;
  T(8, 'Headings',
    level2Applied ? (slashFired ? 'PASS' : 'PARTIAL') : (slashFired ? 'PARTIAL' : 'FAIL'),
    `slash probe on empty block (target=${slashTarget}) + bridge callSetTitleStyleFromJava {type:"subtitle"} on first non-empty block (selected ${headSel})`,
    `slash: showRichTextFormatMenu ${slashBefore} -> ${slashAfter} (CustomSuggestion-Start in console=${slashLogSeen}) — menu itself renders natively, not in web; heading: multi-heading attrs now=${JSON.stringify(attrsNow)}; native <h1-h3> tags=${h1h3Count} (this build has no setHeading path — heading = MultiHeading attribute)`,
    []);

  // ═══════════════ TEST 9 — bulleted and numbered lists ═══════════════
  await selectAllBody();
  await chord(10, '8', 'Digit8', 56); // Ctrl+Shift+8 bullet
  await new Promise((r) => setTimeout(r, 400));
  let bulletOk = await ev(`!!document.querySelector('.ProseMirror ul li')`);
  let bulletVia = 'keyboard Ctrl+Shift+8';
  if (!bulletOk) {
    await ev(`window.__smokeSend('callToggleBulletListFromJava', '')`);
    await new Promise((r) => setTimeout(r, 400));
    bulletOk = await ev(`!!document.querySelector('.ProseMirror ul li')`);
    bulletVia = bulletOk ? 'bridge callToggleBulletListFromJava' : 'failed both';
  }
  const listHtml1 = await ev(`(function(){var l=document.querySelector('.ProseMirror ul,.ProseMirror ol');return l?l.outerHTML.slice(0,160):''})()`);
  await selectAllBody();
  await chord(10, '7', 'Digit7', 55); // Ctrl+Shift+7 ordered
  await new Promise((r) => setTimeout(r, 400));
  let orderedOk = await ev(`!!document.querySelector('.ProseMirror ol li')`);
  let orderedVia = 'keyboard Ctrl+Shift+7';
  if (!orderedOk) {
    await ev(`window.__smokeSend('callToggleOrderedListFromJava', '')`);
    await new Promise((r) => setTimeout(r, 400));
    orderedOk = await ev(`!!document.querySelector('.ProseMirror ol li')`);
    orderedVia = orderedOk ? 'bridge callToggleOrderedListFromJava' : 'failed both';
  }
  const listHtml2 = await ev(`(function(){var l=document.querySelector('.ProseMirror ol');return l?l.outerHTML.slice(0,160):''})()`);
  T(9, 'Bulleted and numbered lists', bulletOk && orderedOk ? 'PASS' : (bulletOk || orderedOk ? 'PARTIAL' : 'FAIL'),
    'select all, Ctrl+Shift+8 / Ctrl+Shift+7; bridge fallback',
    `bullet=${bulletOk ? 'via ' + bulletVia : 'FAILED'}; ordered=${orderedOk ? 'via ' + orderedVia : 'FAILED'}`,
    [listHtml1, listHtml2].filter(Boolean));

  // ═══════════════ TEST 10 — table insertion and editing ═══════════════
  await focusBody();
  const tblCid = await ev(`window.__smokeSend('callInsertTableFromJava', '')`);
  const tblResp = await ev(`window.__smokeResponse(${JSON.stringify(tblCid)}, 4000)`, true);
  await new Promise((r) => setTimeout(r, 600));
  let tblOk = await ev(`(function(){var t=document.querySelector('.ProseMirror table');return t?{rows:t.querySelectorAll('tr').length, cells:t.querySelectorAll('td').length}:0})()`);
  let cellTyped = false;
  let cellClick = 'skipped (no table)';
  if (tblOk) {
    // Real pointer click into the first cell: CDP mouse events let ProseMirror
    // set the selection itself (range-based selection into td did not stick —
    // td is not focusable and execCommand then failed).
    const rect = await ev(`(function(){var td=document.querySelector('.ProseMirror table td'); if(!td) return 0; var r=td.getBoundingClientRect(); return JSON.stringify({x: Math.round(r.left + r.width/2), y: Math.round(r.top + r.height/2)});})()`);
    if (rect) {
      const p = JSON.parse(rect);
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y });
      await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', clickCount: 1 });
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', clickCount: 1 });
      await new Promise((r) => setTimeout(r, 300));
      cellClick = `clicked (${p.x},${p.y})`;
      const tr2 = await typeText('Cell A1');
      await new Promise((r) => setTimeout(r, 300));
      cellTyped = await ev(`(function(){var td=document.querySelector('.ProseMirror table td');return !!(td && td.innerText.indexOf('Cell A1')>=0)})()`);
      cellClick += `; execCommand=${String(tr2)}`;
    } else {
      cellClick = 'no td rect';
    }
  }
  // caret must be INSIDE the table now: addRowAfter throws
  // RangeError "No cell found around position 58" when selection is outside
  // (that is why the previous run's addRow callback timed out).
  const addRowCid = await ev(`window.__smokeSend('callAddRowInTableFromJava', '')`);
  const addRowResp = await ev(`window.__smokeResponse(${JSON.stringify(addRowCid)}, 4000)`, true);
  await new Promise((r) => setTimeout(r, 400));
  const tblAfter = await ev(`(function(){var t=document.querySelector('.ProseMirror table');return t?t.querySelectorAll('tr').length:0})()`);
  const tblHtml = await ev(`(function(){var t=document.querySelector('.ProseMirror table');return t?t.outerHTML.slice(0,300):''})()`);
  const rowsGrew = !!(tblOk && tblAfter > tblOk.rows);
  T(10, 'Table insertion and editing',
    (tblOk && cellTyped && rowsGrew) ? 'PASS' : (tblOk && (cellTyped || rowsGrew) ? 'PARTIAL' : 'FAIL'),
    'bridge callInsertTableFromJava -> CDP mouse click into first cell -> type -> callAddRowInTableFromJava with caret in table',
    `insert response=${JSON.stringify(tblResp)}; table=${JSON.stringify(tblOk)}; cell click=${cellClick}; cell edit ok=${cellTyped}; addRow response=${JSON.stringify(addRowResp)} -> ${tblAfter} rows (grew=${rowsGrew})`,
    [tblHtml].filter(Boolean));

  // ═══════════════ TEST 11 — undo and redo ═══════════════
  // Deterministic: insert a marker string, undo must remove it, redo must restore it.
  await focusBody();
  await typeText(' UNDO_MARKER_XYZ');
  await new Promise((r) => setTimeout(r, 500));
  const beforeUndo = await ev(`(document.querySelector('.ProseMirror')||{innerText:''}).innerText`);
  await focusBody();
  await chord(2, 'z', 'KeyZ', 90);
  await new Promise((r) => setTimeout(r, 500));
  const afterUndo = await ev(`(document.querySelector('.ProseMirror')||{innerText:''}).innerText`);
  const undoChanged = !String(afterUndo).includes('UNDO_MARKER_XYZ') && beforeUndo !== afterUndo;
  await chord(10, 'z', 'KeyZ', 90); // Ctrl+Shift+Z redo
  await new Promise((r) => setTimeout(r, 500));
  const afterRedo = await ev(`(document.querySelector('.ProseMirror')||{innerText:''}).innerText`);
  const redoRestored = String(afterRedo).includes('UNDO_MARKER_XYZ');
  const undoCounts = await ev(`JSON.stringify({undo: window.__smoke.callCounts.undoAvailable||0, redo: window.__smoke.callCounts.redoAvailable||0, undoCall: window.__smoke.callCounts.callUndoFromJava||0})`);
  T(11, 'Undo and redo', (undoChanged && redoRestored) ? 'PASS' : (undoChanged || redoRestored ? 'PARTIAL' : 'FAIL'),
    'Ctrl+Z then Ctrl+Shift+Z on focus body; compare innerText snapshots',
    `undo changed content=${undoChanged} (len ${String(beforeUndo).length} -> ${String(afterUndo).length}); redo restored=${redoRestored} (len ${String(afterRedo).length}); undo/redo state callbacks=${undoCounts}`);

  // ═══════════════ TEST 12 — content JSON updates ═══════════════
  await ev(`(function(){var pm=document.querySelector('.ProseMirror'); if(pm){pm.blur();} return 1})()`);
  let storedJson = null;
  const jsonOk = await waitFor(async () => {
    storedJson = await ev(`localStorage.getItem('coloros_notes_tiptap_json')`);
    if (!storedJson) return false;
    try {
      const j = JSON.parse(storedJson);
      const txt = JSON.stringify(j);
      return txt.includes('Hello ColorOS') ? { len: storedJson.length, type: j.type || (j.content && j.content[0] && j.content[0].type) } : false;
    } catch { return false; }
  }, 6000, 400, 'json');
  const cc12 = await ev(`JSON.stringify({contentUpdate: window.__smoke.callCounts.onContentJsonUpdate||0, titleJson: window.__smoke.callCounts.onTitleJsonUpdate||0, titleChange: window.__smoke.callCounts.onTitleChange||0})`);
  T(12, 'Content JSON updates', jsonOk ? 'PASS' : 'FAIL',
    'poll localStorage coloros_notes_tiptap_json for TipTap JSON containing typed text',
    jsonOk ? `TipTap JSON persisted (${jsonOk.len} chars, root type=${jsonOk.type || '?'}); callback counts=${cc12}`
           : `no qualifying JSON in localStorage after 6s; callback counts=${cc12}`);

  // ═══════════════ TEST 13 — HTML retrieval ═══════════════
  const htmlCid = await ev(`window.__smokeSend('callGetAllHTMLFromJava', '')`);
  const htmlResp = await ev(`window.__smokeResponse(${JSON.stringify(htmlCid)}, 4000)`, true);
  const htmlPass = htmlResp && htmlResp.ok && String(htmlResp.data).includes('Hello ColorOS');
  T(13, 'HTML retrieval', htmlPass ? 'PASS' : 'FAIL',
    'inject callGetAllHTMLFromJava with callbackId, await JS response envelope',
    `response ok=${htmlResp && htmlResp.ok}; value (first 300 chars)=${JSON.stringify(String(htmlResp && htmlResp.data).slice(0, 300))}`);

  // ═══════════════ TEST 14 — plain-text retrieval ═══════════════
  const txtCid = await ev(`window.__smokeSend('callGetTextAndHtmlFromJava', '')`);
  const txtResp = await ev(`window.__smokeResponse(${JSON.stringify(txtCid)}, 4000)`, true);
  let txtParsed = null, txtPass = false;
  try { txtParsed = JSON.parse(txtResp.data); txtPass = String(txtParsed.text).includes('Hello ColorOS') && !!(txtParsed.htmlData && txtParsed.htmlData.content); } catch {}
  T(14, 'Plain-text retrieval', txtPass ? 'PASS' : 'FAIL',
    'inject callGetTextAndHtmlFromJava, await {text, htmlData, textIncludePaint} JSON',
    `response ok=${txtResp && txtResp.ok}; parsed keys=${txtParsed ? Object.keys(txtParsed).join(',') : 'unparsable'}; text snippet=${JSON.stringify(txtParsed ? String(txtParsed.text).slice(0, 80) : String(txtResp && txtResp.data).slice(0, 200))}`);

  // ═══════════════ TEST 15 — reload and restore ═══════════════
  // NOTE: after Page.reload the page's JS context is fresh, so __smoke.flags
  // resets to 0. "mounted again" therefore means flag >= 1 post-reload.
  await cdp.send('Page.reload', { ignoreCache: false });
  await waitFor(() => ev("document.readyState === 'complete' ? 1 : 0"), 20000, 250, 'reload');
  const restored = await waitFor(async () => {
    const f = await ev(`window.__smoke ? window.__smoke.flags.tipTapMounted : 0`);
    if (!f || f < 1) return false;
    const t = await ev(`(document.querySelector('.ProseMirror')||{innerText:''}).innerText`);
    return String(t).includes('Hello ColorOS') ? String(t) : false;
  }, 15000, 400, 'restore');
  const shotRestore = await shot('02_after_restore');
  T(15, 'Reload and restore a saved note', restored ? 'PASS' : 'FAIL',
    'Page.reload on fresh flags counter; mock auto-loads saved JSON from localStorage',
    restored ? `editor content restored after reload: ${JSON.stringify(String(restored).slice(0, 120))}`
             : `content NOT restored within 15s (mounted again=${await ev('window.__smoke?window.__smoke.flags.tipTapMounted:"gone"')})`);

  const shotTable = null; // (table shot taken earlier if needed — see results dir)

  // ── 5. persist results ─────────────────────────────────────────────────────
  const smokeState = await ev(`window.__smoke ? window.__smoke.__smokeState ? window.__smoke.__smokeState() : JSON.parse(JSON.stringify({flags: window.__smoke.flags, callCounts: window.__smoke.callCounts, errors: window.__smoke.errors, noticeCount: window.__smoke.notices.length})) : null`);
  const notices = await ev(`(window.__smoke ? window.__smoke.notices : []).slice(0,40)`);

  const out = {
    ran_at: new Date().toISOString(),
    browser: ver.Browser,
    base_url: BASE,
    tests,
    console: {
      error_count: consoleErrors.length,
      errors: consoleErrors.slice(0, 60),
      transcript_lines: consoleTranscript.length,
      transcript_tail: consoleTranscript.slice(-80),
    },
    network_failures: netFailures.slice(0, 40),
    bridge: { state: smokeState, notice_sample: notices },
    screenshots: fs.readdirSync(RESULTS).filter((f) => f.endsWith('.png')),
  };
  fs.writeFileSync(path.join(RESULTS, 'results.json'), JSON.stringify(out, null, 2));
  fs.writeFileSync(path.join(RESULTS, 'console_full.log'), consoleTranscript.join('\n'));
  log('results written to', path.join(RESULTS, 'results.json'));

  const summary = tests.reduce((a, t) => (a[t.status] = (a[t.status] || 0) + 1, a), {});
  log('SUMMARY:', JSON.stringify(summary));
} catch (err) {
  lastError = err;
  log('FATAL:', err && err.stack || err);
  // record honest NOT TESTED for anything never reached
  const ranIds = new Set(tests.map((t) => t.id));
  const all = ['Application startup', 'Vue mounting', 'TipTap initialization', 'Blank-note initialization',
    'Typing and editing', 'Title editing', 'Bold and italic', 'Headings', 'Bulleted and numbered lists',
    'Table insertion and editing', 'Undo and redo', 'Content JSON updates', 'HTML retrieval',
    'Plain-text retrieval', 'Reload and restore a saved note'];
  all.forEach((name, i) => {
    if (!ranIds.has(i + 1)) tests.push({ id: i + 1, name, status: 'NOT TESTED', attempt: 'never reached', observed: 'aborted: ' + (err && err.message), evidence: [] });
  });
  const out = { ran_at: new Date().toISOString(), fatal: String(err && err.stack || err), tests,
    console: { error_count: consoleErrors.length, errors: consoleErrors.slice(0, 60), transcript_tail: consoleTranscript.slice(-80) },
    network_failures: netFailures.slice(0, 40), browser_log_tail: browserLog.split('\n').slice(-30) };
  fs.writeFileSync(path.join(RESULTS, 'results.json'), JSON.stringify(out, null, 2));
  fs.writeFileSync(path.join(RESULTS, 'console_full.log'), consoleTranscript.join('\n'));
} finally {
  try { if (cdp) cdp.close(); } catch {}
  try { if (browser) browser.kill('SIGTERM'); } catch {}
  try { if (server) server.kill('SIGTERM'); } catch {}
}
} // end async function main()

await main();
process.exit(lastError ? 1 : 0);
