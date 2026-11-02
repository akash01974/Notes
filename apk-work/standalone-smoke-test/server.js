/**
 * server.js — zero-dependency static server for the standalone editor smoke test.
 *
 * URL map:
 *   GET /                        -> harness.html  (separate harness; production index.html untouched)
 *   GET /smoke/<file>            -> files in this directory (bridge_host.js, results, ...)
 *   GET /vendor/mock_bridge.js   -> ../rea-tools/mock_bridge.js  (existing mock, SERVED READ-ONLY)
 *   GET /tiptap/<path>           -> ../extracted/assets/tiptap/<path>  (PRODUCTION BUNDLE, SERVED UNCHANGED)
 *
 * Production assets are never modified — only read.
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.SMOKE_PORT || 8765);
const HERE = __dirname;
const TIPTAP = path.resolve(__dirname, '..', 'extracted', 'assets', 'tiptap');
const MOCK = path.resolve(__dirname, '..', 'rea-tools', 'mock_bridge.js');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.webmanifest': 'application/manifest+json',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8',
};

function send(res, code, body, type) {
  res.writeHead(code, { 'Content-Type': type || 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}

const server = http.createServer((req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    let p = decodeURIComponent(url.pathname);

    let file = null;
    let base = null;

    if (p === '/' || p === '/harness.html') {
      file = path.join(HERE, 'harness.html');
      base = HERE;
    } else if (p.startsWith('/smoke/')) {
      file = path.join(HERE, p.slice('/smoke/'.length));
      base = HERE;
    } else if (p === '/vendor/mock_bridge.js') {
      file = MOCK;
      base = path.dirname(MOCK);
    } else if (p.startsWith('/tiptap/')) {
      file = path.join(TIPTAP, p.slice('/tiptap/'.length));
      base = TIPTAP;
    } else {
      return send(res, 404, '404 ' + p);
    }

    const resolved = path.resolve(file);
    if (!resolved.startsWith(base + path.sep) && resolved !== base) {
      return send(res, 403, 'forbidden');
    }

    fs.readFile(resolved, (err, data) => {
      if (err) return send(res, 404, '404 ' + p);
      const type = TYPES[path.extname(resolved).toLowerCase()] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store', 'Content-Length': data.length });
      res.end(data);
    });
  } catch (e) {
    send(res, 500, 'server error: ' + e.message);
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('[smoke-server] http://127.0.0.1:' + PORT + '/  (harness)  tiptap: /tiptap/*');
});
