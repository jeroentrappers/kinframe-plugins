// Scenarios: a plugin run in the sandbox against recorded responses, step by step, every view checked against the
// view schema and the frame's validator, and the outcome compared to a snapshot (scenarios/<name>.snap.json).
//
// scenarios/<name>.json:
// {
//   "description": "What this shows",
//   "settings": { "zone": "BE" },              // the owner's settings (defaults from the manifest are filled in)
//   "secrets": { "token": "test-token" },      // secret settings, kept apart so they're easy to review
//   "now": "2026-10-25T21:15:00Z",            // the frame's clock (ISO or epoch ms); default 2026-10-25T10:00:00Z
//   "timezone": "Europe/Brussels", "language": "nl", "h24": true, "temperature_unit": "c",
//   "location": { "latitude": 50.91, "longitude": 4.11 },   // the frame's place (needs permissions.location)
//   "dns": { "ha.example.lan": "192.168.1.5" },             // names that must resolve to the home network
//   "store": { "day": "…" },                  // ctx.store at the start
//   "timeout_ms": 2000,                        // hard wall-clock limit per call
//   "http": [                                  // stubs, first match wins; an unmatched request fails the call
//     { "method": "GET", "url": "https://api.example.org/x", "status": 200, "bodyFile": "fixtures/x.json" },
//     { "urlPattern": "^https://api\\.example\\.org/y\\?", "body": { "ok": true }, "contentType": "application/json" },
//     { "url": "https://api.example.org/down", "error": "timeout" }
//   ],
//   "steps": ["start", "update", "render", "detail",           // default: start, update, render, detail
//             { "advance": 60000 },                           // move the clock on
//             { "call": "update", "expect_error": "HTTP 500" },// a call that must fail (substring of the error)
//             { "action": "next" },                           // a button press (needs permissions.actions)
//             { "ws": "open" }, { "ws": "message", "data": { … } }, { "ws": "close", "data": "bye" }]
// }
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, extname } from 'node:path';
import { PluginSandbox } from './sandbox.mjs';
import { checkView } from './view.mjs';
import { fits } from './manifest.mjs';

export const DEFAULT_STEPS = ['start', 'update', 'render', 'detail'];
const SCENARIO_KEYS = ['description', 'settings', 'secrets', 'now', 'timezone', 'language', 'h24', 'temperature_unit', 'location', 'dns', 'store', 'timeout_ms', 'http', 'steps'];
const STUB_KEYS = ['method', 'url', 'urlPattern', 'status', 'body', 'bodyFile', 'contentType', 'error'];
const CALLS = ['start', 'update', 'render', 'detail', 'stop'];
const VIEW_CALLS = ['start', 'render', 'detail', 'action'];
/** On a desktop, more than this for one warm call likely means trouble on the frame (10–20× slower, 250 ms limit). */
export const SLOW_MS = 15;

export function scenarioFiles(dir) {
  const sd = join(dir, 'scenarios');
  if (!existsSync(sd)) return [];
  return readdirSync(sd).filter((f) => f.endsWith('.json') && !f.endsWith('.snap.json')).sort().map((f) => join(sd, f));
}

const CONTENT_TYPES = { '.json': 'application/json', '.ics': 'text/calendar', '.xml': 'application/xml', '.csv': 'text/csv', '.html': 'text/html', '.txt': 'text/plain' };

/** Checks a scenario's shape against the manifest; returns a list of problems. */
export function lintScenario(sc, manifest, dir) {
  const out = [];
  for (const k of Object.keys(sc)) if (!SCENARIO_KEYS.includes(k)) out.push(`unknown key "${k}"`);
  for (const [k, v] of Object.entries(sc.settings || {})) {
    const spec = manifest.settings.find((s) => s.key === k);
    if (!spec) out.push(`settings.${k}: no such setting in plugin.json`);
    else if (spec.type === 'secret') out.push(`settings.${k}: a secret goes under "secrets"`);
    else if (!fits(spec, v)) out.push(`settings.${k}: doesn't fit a ${spec.type} setting`);
  }
  for (const k of Object.keys(sc.secrets || {})) {
    const spec = manifest.settings.find((s) => s.key === k);
    if (!spec || spec.type !== 'secret') out.push(`secrets.${k}: not a secret setting in plugin.json`);
  }
  (sc.http || []).forEach((s, i) => {
    for (const k of Object.keys(s)) if (!STUB_KEYS.includes(k)) out.push(`http[${i}]: unknown key "${k}"`);
    if (!s.url === !s.urlPattern) out.push(`http[${i}]: needs "url" or "urlPattern" (one of them)`);
    if (s.urlPattern) { try { new RegExp(s.urlPattern); } catch (e) { out.push(`http[${i}].urlPattern: ${e.message}`); } }
    if (s.bodyFile && 'body' in s) out.push(`http[${i}]: "body" or "bodyFile", not both`);
    if (s.bodyFile && !existsSync(join(dir, s.bodyFile))) out.push(`http[${i}].bodyFile: ${s.bodyFile} doesn't exist`);
  });
  for (const st of sc.steps || []) {
    if (typeof st === 'string') { if (!CALLS.includes(st)) out.push(`steps: unknown step "${st}"`); continue; }
    if (typeof st !== 'object' || st === null) { out.push(`steps: ${JSON.stringify(st)} is not a step`); continue; }
    const known = ['call', 'action', 'ws', 'advance', 'expect_error', 'data'];
    for (const k of Object.keys(st)) if (!known.includes(k)) out.push(`steps: unknown key "${k}" in ${JSON.stringify(st)}`);
    if (st.call && !CALLS.includes(st.call)) out.push(`steps: unknown call "${st.call}"`);
    if (st.ws && !['open', 'message', 'close'].includes(st.ws)) out.push(`steps: ws must be open, message or close`);
  }
  return out;
}

function stubFetch(sc, dir, used) {
  const stubs = (sc.http || []).map((s, i) => ({ ...s, i, re: s.urlPattern ? new RegExp(s.urlPattern) : null }));
  return async (req) => {
    const s = stubs.find((x) => (x.method || 'GET').toUpperCase() === req.method && (x.re ? x.re.test(req.url) : x.url === req.url));
    if (!s) throw new Error(`no stub for ${req.method} ${req.url} (add it to the scenario's "http")`);
    used.add(s.i);
    if (s.error) throw new Error(s.error);
    let body = '';
    let type = s.contentType;
    if (s.bodyFile) {
      body = readFileSync(join(dir, s.bodyFile), 'utf8');
      type = type || CONTENT_TYPES[extname(s.bodyFile)] || 'application/octet-stream';
    } else if (typeof s.body === 'string') {
      body = s.body; type = type || 'text/plain';
    } else if (s.body !== undefined) {
      body = JSON.stringify(s.body); type = type || 'application/json';
    }
    return { status: s.status ?? 200, body, contentType: type ?? null };
  };
}

function parseNow(v) {
  if (v === undefined) return Date.parse('2026-10-25T10:00:00Z');
  if (typeof v === 'number') return v;
  const t = Date.parse(v);
  if (Number.isNaN(t)) throw new Error(`now: not a date: ${v}`);
  return t;
}

/**
 * Runs one scenario. Returns { name, record, errors, warnings } where `record` is what the snapshot holds.
 */
export async function runScenario(plugin, file, { timeoutMs } = {}) {
  const name = file.split('/').pop().replace(/\.json$/, '');
  const errors = [], warnings = [];
  let sc;
  try { sc = JSON.parse(readFileSync(file, 'utf8')); } catch (e) { return { name, record: null, errors: [`not valid JSON: ${e.message}`], warnings }; }
  if (!plugin.manifest) return { name, record: null, errors: [`plugin.json: ${plugin.manifestError}`], warnings };
  if (!plugin.main) return { name, record: null, errors: ['no main.js'], warnings };
  const lint = lintScenario(sc, plugin.manifest, plugin.dir);
  if (lint.length) return { name, record: null, errors: lint, warnings };

  const used = new Set();
  const settings = { ...(sc.settings || {}), ...(sc.secrets || {}) };
  let sb;
  try {
    sb = new PluginSandbox({
      manifest: plugin.manifest, main: plugin.main, locales: plugin.locales, settings,
      env: { now: parseNow(sc.now), timezone: sc.timezone, language: sc.language, location: sc.location, h24: sc.h24, temperatureUnit: sc.temperature_unit },
      fetch: stubFetch(sc, plugin.dir, used), dns: sc.dns || null, timeoutMs: timeoutMs ?? sc.timeout_ms ?? 2000,
    });
  } catch (e) {
    return { name, record: null, errors: [e.message], warnings };
  }
  for (const [k, v] of Object.entries(sc.store || {})) sb.store.set(k, typeof v === 'string' ? v : JSON.stringify(v));

  const steps = [];
  const warm = new Set();
  for (const raw of sc.steps || DEFAULT_STEPS) {
    const st = typeof raw === 'string' ? { call: raw } : raw;
    if (st.advance !== undefined) { sb.now += Number(st.advance); steps.push({ advance: Number(st.advance) }); continue; }
    const logs0 = sb.logs.length, req0 = sb.requests.length, sent0 = sb.wsSent.length, inv0 = sb.invalidations;
    let r, label;
    if (st.ws) { label = `ws ${st.ws}`; r = await sb.wsEvent(st.ws, st.data); }
    else if (st.action !== undefined) { label = `action ${st.action}`; r = await sb.call('action', String(st.action)); }
    else { label = st.call; r = await sb.call(st.call); }
    const rec = { call: label };
    if (r.defined === false && !r.error) rec.exported = false;
    if (sb.requests.length > req0) rec.requests = sb.requests.slice(req0);
    if (VIEW_CALLS.includes(st.call || (st.action !== undefined ? 'action' : '')) && r.defined !== false && !r.error) rec.view = r.view;
    if (r.error) rec.error = r.error;
    if (sb.logs.length > logs0) rec.logs = sb.logs.slice(logs0);
    if (sb.wsSent.length > sent0) rec.ws_sent = sb.wsSent.slice(sent0).map((m) => { try { return JSON.parse(m); } catch { return m; } });
    if (sb.invalidations > inv0) rec.invalidations = sb.invalidations - inv0;
    steps.push(rec);

    if (st.expect_error !== undefined) {
      if (!r.error) errors.push(`${label}: expected an error containing "${st.expect_error}", but it worked`);
      else if (!r.error.includes(String(st.expect_error))) errors.push(`${label}: expected an error containing "${st.expect_error}", got: ${r.error}`);
    } else if (r.error) {
      errors.push(r.error);
    }
    if (rec.view && rec.view !== null) {
      const c = checkView(rec.view, { manifest: plugin.manifest, settings: sb.settings, dns: sc.dns || null });
      c.errors.forEach((e) => errors.push(`${label}: ${e}`));
      c.warnings.forEach((w) => warnings.push(`${label}: ${w}`));
    }
    const key = label;
    if (warm.has(key) && r.ms > SLOW_MS && !r.error) warnings.push(`${label} took ${r.ms.toFixed(1)} ms here; a frame is 10–20× slower and interrupts a call at 250 ms of JavaScript`);
    warm.add(key);
  }
  sb.close();
  (sc.http || []).forEach((s, i) => { if (!used.has(i)) warnings.push(`http[${i}] (${s.url || s.urlPattern}) was never requested`); });

  const record = { steps };
  if (sb.store.size) record.store = Object.fromEntries([...sb.store.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  if (sb.dataTime !== null) record.dataTime = new Date(sb.dataTime).toISOString();
  return { name, record, errors, warnings };
}

export const snapText = (record) => JSON.stringify(record, null, 2) + '\n';

/** A short line diff of two texts (first difference with a little context). */
export function diffText(expected, actual, context = 3) {
  const a = expected.split('\n'), b = actual.split('\n');
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  let ea = a.length - 1, eb = b.length - 1;
  while (ea >= i && eb >= i && a[ea] === b[eb]) { ea--; eb--; }
  const out = [];
  for (let k = Math.max(0, i - context); k < i; k++) out.push('  ' + a[k]);
  for (let k = i; k <= ea && k < i + 20; k++) out.push('- ' + a[k]);
  for (let k = i; k <= eb && k < i + 20; k++) out.push('+ ' + b[k]);
  for (let k = ea + 1; k < Math.min(a.length, ea + 1 + context); k++) out.push('  ' + a[k]);
  return out.join('\n');
}

/** Runs a scenario and compares (or with `update`, writes) its snapshot. */
export async function testScenario(plugin, file, { update = false, timeoutMs } = {}) {
  const res = await runScenario(plugin, file, { timeoutMs });
  const snap = file.replace(/\.json$/, '.snap.json');
  res.snapshot = snap;
  if (!res.record) return res;
  const text = snapText(res.record);
  if (update) {
    if (!existsSync(snap) || readFileSync(snap, 'utf8') !== text) { writeFileSync(snap, text); res.updated = true; }
  } else if (!existsSync(snap)) {
    res.errors.push(`no snapshot ${snap.split('/').slice(-2).join('/')}: run "kit test ${plugin.folder} --update" and review it`);
  } else {
    const old = readFileSync(snap, 'utf8');
    if (old !== text) res.errors.push(`differs from its snapshot:\n${diffText(old, text)}`);
  }
  return res;
}
