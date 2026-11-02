/**
 * cdp.mjs — minimal Chrome DevTools Protocol client.
 * Uses Node's built-in global WebSocket (Node >= 22). No external packages.
 */
export class CDP {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.id = 0;
    this.pending = new Map();
    this.eventHandlers = [];
    this.closed = false;
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl);
      this.ws.addEventListener('open', () => resolve(this));
      this.ws.addEventListener('error', (e) => reject(new Error('CDP ws error: ' + (e.message || 'connect failed'))));
      this.ws.addEventListener('close', () => {
        this.closed = true;
        for (const [, p] of this.pending) p.reject(new Error('CDP connection closed'));
        this.pending.clear();
      });
      this.ws.addEventListener('message', (ev) => {
        let m;
        try { m = JSON.parse(ev.data); } catch { return; }
        if (m.id !== undefined && this.pending.has(m.id)) {
          const { resolve: r, reject: j } = this.pending.get(m.id);
          this.pending.delete(m.id);
          if (m.error) j(new Error(`CDP ${m.error.message} (code ${m.error.code})`));
          else r(m.result);
        } else if (m.method) {
          for (const h of this.eventHandlers) h(m);
        }
      });
    });
  }

  send(method, params = {}, sessionId) {
    return new Promise((resolve, reject) => {
      if (this.closed) return reject(new Error('CDP closed'));
      const id = ++this.id;
      this.pending.set(id, { resolve, reject });
      const payload = { id, method, params };
      if (sessionId) payload.sessionId = sessionId;
      this.ws.send(JSON.stringify(payload));
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`CDP timeout: ${method}`));
        }
      }, 20000);
    });
  }

  on(fn) { this.eventHandlers.push(fn); }

  close() { try { this.ws.close(); } catch {} }
}

export async function waitFor(fn, timeoutMs = 15000, intervalMs = 250, label = 'condition') {
  const t0 = Date.now();
  for (;;) {
    let v;
    try { v = await fn(); } catch { v = null; }
    if (v) return v;
    if (Date.now() - t0 > timeoutMs) return null;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}
