/** probe_boot.mjs — one-off: dump the blank-note DOM/visual state after mount. */
import { CDP, waitFor } from './cdp.mjs';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BASE = 'http://127.0.0.1:8765/';
const CDP_PORT = 9334;

const server = spawn('node', [path.join(HERE, 'server.js')], { stdio: ['ignore', 'ignore', 'inherit'], env: { ...process.env, SMOKE_PORT: '8765' } });
const profile = path.join('/tmp/opencode', 'helium-probe-' + Date.now());
fs.mkdirSync(profile, { recursive: true });
const browser = spawn('/usr/bin/helium-browser', [
  '--headless', `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', '--disable-extensions',
  '--window-size=412,915', 'about:blank',
], { stdio: ['ignore', 'ignore', 'ignore'] });

try {
  const ver = await waitFor(async () => {
    try { return await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`)).json(); } catch { return null; }
  }, 25000, 300);
  if (!ver) throw new Error('no cdp');
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
  await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 412, height: 915, deviceScaleFactor: 2, mobile: true });
  if (!target.url || target.url === 'about:blank') await cdp.send('Page.navigate', { url: BASE });
  await waitFor(async () => {
    const r = await cdp.send('Runtime.evaluate', { expression: "document.readyState==='complete'", returnByValue: true });
    return r.result.value;
  }, 20000, 250);
  // wait for mount + a couple seconds, same point as T4
  await waitFor(async () => {
    const r = await cdp.send('Runtime.evaluate', { expression: "!!(window.__smoke && window.__smoke.flags.tipTapMounted)", returnByValue: true });
    return r.result.value;
  }, 15000, 300);
  await new Promise((r) => setTimeout(r, 3000));
  // focus + caret in first block (same as the T4 screenshot step)
  await cdp.send('Runtime.evaluate', {
    expression: `(function(){
      var pm=document.querySelector('.ProseMirror'); if(!pm) return 'no-editor';
      pm.focus();
      var first=pm.firstElementChild;
      var sel=window.getSelection(), r=document.createRange();
      if(first){ r.selectNodeContents(first); r.collapse(true); } else { r.selectNodeContents(pm); }
      sel.removeAllRanges(); sel.addRange(r);
      return 'ok';
    })()`,
    returnByValue: true,
  });
  await new Promise((r) => setTimeout(r, 800));

  const dump = await cdp.send('Runtime.evaluate', {
    returnByValue: true,
    expression: `JSON.stringify((function () {
      var pm = document.querySelector('.ProseMirror');
      var app = document.querySelector('#app');
      var skins = Array.from(document.querySelectorAll('[class*="skin"]')).map(function (e) {
        var r = e.getBoundingClientRect(), cs = getComputedStyle(e);
        return { cls: String(e.className).slice(0, 60), rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)], display: cs.display, vis: cs.visibility, z: cs.zIndex, bg: cs.backgroundColor.slice(0, 40) };
      });
      var pmInfo = 0;
      if (pm) {
        var r = pm.getBoundingClientRect(), cs = getComputedStyle(pm);
        var p0 = pm.querySelector('p');
        var wrap = p0 && p0.parentElement;
        var pb = p0 ? getComputedStyle(p0, '::before') : null;
        pmInfo = {
          cls: String(pm.className),
          rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
          display: cs.display, vis: cs.visibility, opacity: cs.opacity, color: cs.color,
          text: pm.innerText.slice(0, 60),
          html: pm.outerHTML.slice(0, 400),
          parentCls: String(pm.parentElement && pm.parentElement.className),
          wrapperCls: wrap ? String(wrap.className) : 'none',
          beforeContent: pb ? pb.content : 'no-p',
          beforeColor: pb ? pb.color : '',
          beforeDisplay: pb ? pb.display : '',
          beforeFontSize: pb ? pb.fontSize : '',
          rootVar: getComputedStyle(document.documentElement).getPropertyValue('--46c48d60').trim() || '(unset)',
        };
      }
      return {
        pm: pmInfo, skins: skins,
        bodyText: document.body.innerText.slice(0, 200),
        placeholders: Array.from(document.querySelectorAll('[data-placeholder]')).map(function (e) {
          return { tag: e.tagName, ph: e.getAttribute('data-placeholder'), txt: (e.innerText || '').slice(0, 30) };
        }).slice(0, 6),
        appHtmlLen: app ? app.innerHTML.length : -1,
      };
    })())`,
  });
  console.log(dump.result.value);
  const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(HERE, 'results', 'probe_boot.png'), Buffer.from(shot.data, 'base64'));
  cdp.close();
} finally {
  try { browser.kill('SIGTERM'); } catch {}
  try { server.kill('SIGTERM'); } catch {}
}
