// A plugin instance in QuickJS, the way the frame runs it (kinframe android/frame/.../js/QuickJsPluginInstance.kt):
// one runtime per instance with 8 MB of heap and a 256 KB stack, the frame's own prelude.js and host libraries
// (kit/host/, vendored), and the `__kf` bindings implemented here in Node with the frame's rules: the http permission
// rules, no network in render/detail, the 64 KB store, ctx.format, ctx.localTime, ctx.location only with the
// permission, ctx.t from locales/. Calls have a hard wall-clock timeout; the frame's CPU budget isn't emulated.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { newQuickJSWASMModuleFromVariant } from 'quickjs-emscripten-core';
import variant from '@jitl/quickjs-wasmfile-release-sync';
import { HOST_DIR } from './paths.mjs';
import { PluginFormat, localTime, checkZone, canonicalTag } from './format.mjs';
import { withDefaults } from './manifest.mjs';
import { authorize } from './net.mjs';

export const LIMITS = {
  memoryBytes: 8 * 1024 * 1024,
  stackBytes: 256 * 1024,
  storeBytes: 64 * 1024,
  responseBytes: 1024 * 1024,
  logChars: 2000,
};
/** Calls that draw from what `update` fetched: no network there. */
export const OFFLINE_CALLS = ['render', 'detail'];
const RESERVED_HEADERS = ['host', 'user-agent', 'cookie', 'content-length', 'transfer-encoding', 'connection'];

let quickjs;
export async function loadQuickJS() {
  if (!quickjs) quickjs = await newQuickJSWASMModuleFromVariant(variant);
  return quickjs;
}

let hostFiles;
/** The frame's prelude and libraries, as vendored in kit/host. */
export function hostSources() {
  if (!hostFiles) {
    const libDir = join(HOST_DIR, 'lib');
    const libraries = {};
    for (const f of readdirSync(libDir).filter((x) => x.endsWith('.js')).sort()) libraries['kinframe/' + f.slice(0, -3)] = readFileSync(join(libDir, f), 'utf8');
    hostFiles = { prelude: readFileSync(join(HOST_DIR, 'prelude.js'), 'utf8'), libraries };
  }
  return hostFiles;
}

/** A plugin folder as the frame reads a bundle: plugin.json, main.js, locales/<tag>.json (flat string maps). */
export function readLocales(dir) {
  const ld = join(dir, 'locales');
  const out = {};
  if (!existsSync(ld)) return out;
  for (const f of readdirSync(ld).filter((x) => x.endsWith('.json')).sort()) {
    const o = JSON.parse(readFileSync(join(ld, f), 'utf8'));
    out[f.slice(0, -5)] = Object.fromEntries(Object.entries(o).filter(([, v]) => typeof v === 'string'));
  }
  return out;
}

/** PluginBundle.strings: the exact tag, then its language, then English. */
export function strings(locales, tag) {
  const lang = tag.split('-')[0].toLowerCase();
  const exactKey = tag in locales ? tag : Object.keys(locales).find((k) => k.toLowerCase() === tag.toLowerCase());
  return { ...(locales.en || {}), ...(locales[lang] || {}), ...(exactKey ? locales[exactKey] : {}) };
}

export class HttpError extends Error {}

/**
 * One plugin instance.
 *
 * @param {object} o
 * @param {object} o.manifest   parsed manifest (manifest.mjs)
 * @param {string} o.main       main.js source
 * @param {object} o.locales    tag → key → text
 * @param {object} o.settings   the owner's settings, secrets included (defaults are filled in here)
 * @param {object} [o.env]      { now, timezone, language, location, h24, temperatureUnit }
 * @param {Function} [o.fetch]  async ({ method, url, headers, body, contentType }) → { status, body, contentType }
 * @param {object} [o.dns]      host → address(es), for names that must be on the home network
 * @param {number} [o.timeoutMs] hard wall-clock limit per call (default 2000)
 */
export class PluginSandbox {
  constructor({ manifest, main, locales = {}, settings = {}, env = {}, fetch = null, dns = null, timeoutMs = 2000 }) {
    this.manifest = manifest;
    this.main = main;
    this.locales = locales;
    this.settings = withDefaults(manifest, settings);
    this.now = typeof env.now === 'number' ? env.now : Date.parse('2026-10-25T10:00:00Z');
    this.timezone = checkZone(env.timezone || 'Europe/Brussels');
    this.language = canonicalTag(env.language || 'en');
    this.location = env.location || null;
    this.format = new PluginFormat({ language: this.language, zone: this.timezone, h24: env.h24 !== false, temperatureUnit: env.temperatureUnit || 'c' });
    this.fetch = fetch;
    this.dns = dns;
    this.timeoutMs = timeoutMs;
    this.store = new Map();
    this.logs = [];
    this.requests = [];
    this.wsSent = [];
    this.invalidations = 0;
    this.dataTime = null;
    this.socketUrl = null;
    this.vm = null;
    this.rt = null;
  }

  // ------------------------------------------------------------------ lifecycle

  async boot() {
    this.close();
    const Q = await loadQuickJS();
    const { prelude, libraries } = hostSources();
    const rt = Q.newRuntime();
    rt.setMemoryLimit(LIMITS.memoryBytes);
    rt.setMaxStackSize(LIMITS.stackBytes);
    let missing = null;
    rt.setModuleLoader((name) => {
      if (name === 'main') return this.main;
      if (Object.prototype.hasOwnProperty.call(libraries, name)) return libraries[name];
      if (missing === null) missing = name;
      return { error: new Error(`import '${name}': a plugin can only import the host's libraries (${Object.keys(libraries).join(', ')})`) };
    }, (_base, requested) => requested);
    const vm = rt.newContext();
    this.rt = rt; this.vm = vm;
    this.pending = new Set();
    this.defineBindings(vm);
    this.deadline = Date.now() + this.timeoutMs;
    rt.setInterruptHandler(() => Date.now() > this.deadline);
    const p = vm.evalCode(prelude, 'prelude.js', { type: 'global' });
    if (p.error) { const e = vm.dump(p.error); p.error.dispose(); this.close(); throw new Error('prelude: ' + (e && e.message || e)); }
    p.value.dispose();
    const m = vm.evalCode("import plugin from 'main'; globalThis.__plugin = plugin;", 'boot.js', { type: 'module' });
    let err = null;
    if (m.error) { err = vm.dump(m.error); m.error.dispose(); }
    else {
      const st = vm.getPromiseState(m.value);
      if (st.type === 'rejected') { err = vm.dump(st.error); st.error.dispose(); }
      else if (st.type === 'fulfilled' && st.value && st.value !== m.value) st.value.dispose();
      m.value.dispose();
      this.drain();
    }
    if (err) {
      this.close();
      if (missing !== null) throw new Error(`import '${missing}': a plugin can only import the host's libraries (${Object.keys(libraries).join(', ')})`);
      throw new Error('start: ' + describe(err));
    }
  }

  close() {
    if (this.vm) {
      try { this.vm.dispose(); this.rt.dispose(); } catch { /* a runtime that ran out of memory may not dispose cleanly */ }
    }
    this.vm = null; this.rt = null;
  }

  // ------------------------------------------------------------------ bindings

  defineBindings(vm) {
    const k = vm.newObject();
    const fn = (name, f) => {
      const h = vm.newFunction(name, (...args) => {
        const a = args.map((x) => vm.dump(x));
        try {
          return this.toHandle(f(...a));
        } catch (e) {
          return { error: vm.newError(e.message) };
        }
      });
      vm.setProp(k, name, h);
      h.dispose();
    };
    const self = this;
    fn('settings', () => JSON.stringify(self.settings));
    fn('log', (m) => { self.logs.push(String(m ?? '').slice(0, LIMITS.logChars)); });
    fn('now', () => self.now);
    fn('zone', () => self.timezone);
    fn('location', () => self.locationJson());
    fn('local_time', (ms, zone) => JSON.stringify(localTime(Math.trunc(ms), typeof zone === 'string' ? checkZone(zone) : self.timezone)));
    fn('language', () => self.language);
    fn('t', (key, vars) => self.translate(String(key ?? ''), vars));
    fn('fmt', (kind, a1, a2, a3) => self.format.call(kind, a1, a2, a3, self.now));
    fn('store_get', (key) => (self.store.has(String(key)) ? self.store.get(String(key)) : null));
    fn('store_put', (key, value) => { self.storePut(String(key), value === null || value === undefined ? null : String(value)); });
    fn('data_time', (ms) => { self.dataTime = ms >= 0 ? Math.trunc(ms) : null; });
    fn('invalidate', () => { self.invalidations++; });
    fn('ret', (json, defined) => { self.result = typeof json === 'string' ? json : null; self.defined = defined !== false; });
    fn('fail', (msg) => { self.error = msg == null ? 'error' : String(msg); });
    fn('ws_connect', (url) => self.wsConnect(String(url)));
    fn('ws_send', (msg) => { if (self.socketUrl) self.wsSent.push(String(msg)); });
    fn('ws_close', () => { self.socketUrl = null; });
    fn('js_thread', () => {});
    fn('resumed', () => {});
    const http = vm.newFunction('http', (...args) => {
      const [method, url, opts] = args.map((x) => vm.dump(x));
      const d = vm.newPromise();
      const op = self.http(method, url, opts).then(
        (text) => { if (self.vm === vm) { const h = vm.newString(text); d.resolve(h); h.dispose(); } },
        (e) => { if (self.vm === vm) { const h = vm.newError(e.message); d.reject(h); h.dispose(); } },
      ).finally(() => { self.pending.delete(op); d.dispose(); });
      self.pending.add(op);
      return d.handle;
    });
    vm.setProp(k, 'http', http);
    http.dispose();
    vm.setProp(vm.global, '__kf', k);
    k.dispose();
  }

  toHandle(v) {
    const vm = this.vm;
    if (v === undefined) return vm.undefined;
    if (v === null) return vm.null;
    if (typeof v === 'string') return vm.newString(v);
    if (typeof v === 'number') return vm.newNumber(v);
    if (typeof v === 'boolean') return v ? vm.true : vm.false;
    return vm.newString(JSON.stringify(v));
  }

  locationJson() {
    if (!this.manifest.permissions.location || !this.location) return null;
    const r = (x) => Math.round(x * 100) / 100;
    return JSON.stringify({ latitude: r(this.location.latitude), longitude: r(this.location.longitude) });
  }

  translate(key, varsJson) {
    let s = strings(this.locales, this.language)[key] ?? key;
    let vars = null;
    try { vars = typeof varsJson === 'string' ? JSON.parse(varsJson) : null; } catch { vars = null; }
    if (vars && typeof vars === 'object' && !Array.isArray(vars)) {
      for (const [k, v] of Object.entries(vars)) {
        const text = v === null ? 'null' : typeof v === 'object' ? JSON.stringify(v) : String(v);
        s = s.split(`{${k}}`).join(text);
      }
    }
    return s;
  }

  storePut(key, value) {
    let others = 0;
    for (const [k, v] of this.store) if (k !== key) others += v.length;
    if (value !== null && others + key.length + value.length > LIMITS.storeBytes) throw new Error('store full');
    if (value === null) this.store.delete(key); else this.store.set(key, value);
  }

  wsConnect(url) {
    try {
      authorize(url, { manifest: this.manifest, settings: this.settings, ws: true, dns: this.dns });
      this.socketUrl = url;
    } catch (e) {
      // The frame logs a refused socket instead of failing the call.
      this.socketUrl = null;
      this.logs.push('ws: ' + e.message);
    }
  }

  async http(method, url, optsJson) {
    if (this.offline) throw new Error(`${this.offline} can't use the network: fetch in update() and keep the data in ctx.state`);
    let o = {};
    try { o = optsJson ? JSON.parse(optsJson) : {}; } catch { o = {}; }
    authorize(url, { manifest: this.manifest, settings: this.settings, dns: this.dns });
    if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) throw new Error(`method ${method}`);
    const headers = {};
    for (const [hk, hv] of Object.entries(o.headers || {})) if (typeof hv === 'string' && !RESERVED_HEADERS.includes(hk.toLowerCase())) headers[hk] = hv;
    const req = { method, url: String(url), headers, body: method === 'GET' ? null : (o.body ?? ''), contentType: method === 'GET' ? null : (o.type || 'application/json') };
    this.requests.push({ method, url: req.url, ...(req.body ? { body: req.body } : {}) });
    if (!this.fetch) throw new Error(`no network in the kit: ${method} ${url}`);
    const r = await this.fetch(req);
    const body = typeof r.body === 'string' ? r.body : r.body === undefined || r.body === null ? '' : JSON.stringify(r.body);
    if (Buffer.byteLength(body, 'utf8') > LIMITS.responseBytes) throw new Error('response too large');
    return JSON.stringify({ status: r.status ?? 200, body, type: r.contentType ?? null });
  }

  // ------------------------------------------------------------------ calls

  /** Runs pending jobs within the call's deadline. */
  drain() {
    const r = this.rt.executePendingJobs();
    if (r.error) { const e = this.vm.dump(r.error); r.error.dispose(); throw new Error(describe(e)); }
    r.value?.dispose?.();
  }

  async evalWithin(name, script) {
    const vm = this.vm;
    this.deadline = Date.now() + this.timeoutMs;
    const r = vm.evalCode(script, `${name}.js`, { type: 'global' });
    if (r.error) { const e = vm.dump(r.error); r.error.dispose(); throw new Error(describe(e)); }
    r.value.dispose();
    this.drain();
    while (this.result === undefined && this.error === undefined && this.vm === vm) {
      if (!this.pending.size) break;
      const timer = new Promise((res) => { this.timer = setTimeout(res, Math.max(0, this.deadline - Date.now()), 'timeout'); });
      const first = await Promise.race([Promise.race([...this.pending]).then(() => 'done', () => 'done'), timer]);
      clearTimeout(this.timer);
      if (first === 'timeout') throw new Error('interrupted');
      this.drain();
    }
  }

  /**
   * Calls `name` (start, update, render, detail, stop, action) like the host: returns
   * { name, defined, view, error, ms }. `view` is the returned value after JSON (what the frame validates).
   */
  async call(name, arg) {
    if (name === 'action' && !this.manifest.permissions.actions) return { name, defined: false, view: null, error: `${this.manifest.id} has no actions permission`, ms: 0 };
    const t0 = performance.now();
    if (!this.vm) {
      if (name === 'detail' || name === 'action' || name === 'stop') return { name, defined: false, view: null, error: null, ms: 0, notStarted: true };
      try { await this.boot(); } catch (e) { return { name, defined: false, view: null, error: e.message, ms: performance.now() - t0 }; }
    }
    this.result = undefined; this.error = undefined; this.defined = true;
    this.offline = OFFLINE_CALLS.includes(name) ? name : null;
    const script = arg === undefined ? `__kf_call('${name}')` : `__kf_call('${name}', ${JSON.stringify(String(arg))})`;
    let error = null;
    try {
      await this.evalWithin(name, script);
      if (this.error !== undefined) error = this.error === 'interrupted' ? `took longer than ${this.timeoutMs} ms` : this.error;
      else if (this.result === undefined) {
        // An interrupt can't be caught, so an endless loop in an async function leaves its promise unsettled.
        error = Date.now() >= this.deadline ? `took longer than ${this.timeoutMs} ms` : 'never finished: it awaits something that never resolves';
      }
    } catch (e) {
      error = e.message === 'interrupted' ? `took longer than ${this.timeoutMs} ms` : e.message;
      if (/out of memory/.test(e.message) || /out of memory/.test(String(this.error))) this.close();
    } finally {
      this.offline = null;
    }
    if (error && /out of memory/.test(error)) this.close();
    const ms = performance.now() - t0;
    if (error) return { name, defined: true, view: null, error: `${name}: ${error}`, ms };
    return { name, defined: this.defined, view: this.result == null ? null : JSON.parse(this.result), error: null, ms };
  }

  /** A WebSocket event for the plugin's handlers: 'open', 'message' (data: string or JSON value), 'close'. */
  async wsEvent(type, data) {
    if (!this.vm || !this.socketUrl) return { name: `ws ${type}`, error: 'the plugin has no WebSocket open', ms: 0 };
    const t0 = performance.now();
    const text = data === undefined || data === null ? 'null' : JSON.stringify(typeof data === 'string' ? data : JSON.stringify(data));
    this.result = undefined; this.error = undefined;
    let error = null;
    try {
      // __kf_ws_event doesn't report back through ret/fail; a handler failure is logged by the prelude.
      const before = this.logs.length;
      this.result = null;
      await this.evalWithin(`ws ${type}`, `__kf_ws_event('${type}', ${text})`);
      while (this.pending.size) { await Promise.race([...this.pending]).catch(() => {}); this.drain(); }
      const failed = this.logs.slice(before).find((l) => l.startsWith(`ws ${type} handler failed`));
      if (failed) error = failed;
    } catch (e) {
      error = `ws ${type}: ` + (e.message === 'interrupted' ? `took longer than ${this.timeoutMs} ms` : e.message);
    }
    return { name: `ws ${type}`, error, ms: performance.now() - t0 };
  }
}

function describe(e) {
  if (e && typeof e === 'object' && e.message) return String(e.message);
  return String(e);
}
