// Views as the frame checks them, twice: against the view schema (kit/schema/plugin-view.schema.json, with ajv) and
// with a port of the frame's validator (kinframe android/core/.../plugin/PluginViewParser.kt), which also enforces
// what JSON Schema can't say (depth, component count, size, edges naming nodes, indexes pointing at numbers). A view
// must pass both. Then the host's own rules: buttons need `permissions.actions`; an image the plugin's network
// permissions don't allow never loads on the frame (a warning, as the frame only logs it).
import { readFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import { SCHEMA } from './schema.mjs';
import { authorize } from './net.mjs';

export const LIMITS = {
  MAX_JSON_BYTES: 16 * 1024, MAX_DEPTH: 3, MAX_COMPONENTS: 24, MAX_STACK_ITEMS: 4, MAX_ROWS: 4,
  MIN_FLOW_NODES: 2, MAX_FLOW_NODES: 5, MAX_FLOW_EDGES: 8, MIN_POINTS: 2, MAX_POINTS: 100, MAX_TEXT_LINES: 2,
  MAX_TEXT_LINE: 60, MAX_VALUE: 16, MAX_UNIT: 8, MAX_LABEL: 32, MAX_GAUGE_LABEL: 12, MAX_NODE_TEXT: 16, MAX_ID: 24,
  MAX_ACTIONS: 5, MAX_SUB: 3, MAX_SUB_TEXT: 12, MAX_ACTION_LABEL: 16, MAX_SRC: 2048, MAX_DESCRIPTION: 60,
  MAX_LIST_ROWS: 5, MAX_LIST_TITLE: 40, MAX_LIST_TIME: 10, MAX_LIST_DETAIL: 16, MAX_LIST_BADGE: 10, MAX_MAGNITUDE: 1e12,
};

export const SCHEMA_JSON = JSON.parse(readFileSync(SCHEMA, 'utf8'));
export const ICONS = SCHEMA_JSON.$defs.icon.enum;
export const TONES = SCHEMA_JSON.$defs.tone.enum;

let validateSchema;
function schemaValidator() {
  if (!validateSchema) {
    const ajv = new Ajv2020({ allErrors: false, strict: false });
    validateSchema = ajv.compile(SCHEMA_JSON);
  }
  return validateSchema;
}

class ViewError extends Error {
  constructor(path, reason) { super(reason); this.path = path; this.reason = reason; }
}

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const ID = /^[a-z0-9_-]+$/;
// Kotlin's Char.isISOControl (U+0000–U+001F, U+007F–U+009F) plus the line and paragraph separators.
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/;

/** The frame's validator, ported: returns null when valid, else { path, reason }. Takes parsed JSON. */
export function parseView(element) {
  let components = 0;
  const fail = (path, reason) => { throw new ViewError(path, reason); };
  const obj = (e, path) => (isObj(e) ? e : fail(path, 'expected an object'));
  const allowOnly = (o, path, keys) => { const k = Object.keys(o).find((x) => !keys.includes(x)); if (k !== undefined) fail(`${path}/${k}`, 'unknown property'); };

  function checkText(e, path, max) {
    if (typeof e !== 'string') fail(path, 'expected a string');
    if (/^\s*$/.test(e)) fail(path, 'must not be empty');
    if ([...e].length > max) fail(path, `longer than ${max} characters`);
    if (CONTROL.test(e)) fail(path, 'contains line breaks or control characters');
    return e;
  }
  function string(o, key, path, max, required = false) {
    if (!(key in o)) return required ? fail(`${path}/${key}`, 'required') : null;
    return checkText(o[key], `${path}/${key}`, max);
  }
  function number(o, key, path, required = false) {
    if (!(key in o)) return required ? fail(`${path}/${key}`, 'required') : null;
    const v = o[key];
    if (typeof v === 'string' || v === null || typeof v === 'object') fail(`${path}/${key}`, 'expected a number');
    if (typeof v !== 'number' || !Number.isFinite(v) || Math.abs(v) > LIMITS.MAX_MAGNITUDE) fail(`${path}/${key}`, 'expected a finite number');
    return Math.fround(v);
  }
  function array(o, key, path, min, max) {
    if (!(key in o)) fail(`${path}/${key}`, 'required');
    const a = o[key];
    if (!Array.isArray(a)) fail(`${path}/${key}`, 'expected an array');
    if (a.length < min) fail(`${path}/${key}`, `needs at least ${min} item${min === 1 ? '' : 's'}`);
    if (a.length > max) fail(`${path}/${key}`, `at most ${max} items`);
    return a;
  }
  function bool(o, key) { return typeof o[key] === 'boolean' ? o[key] : false; }
  function tone(o, path, key = 'tone') {
    const t = string(o, key, path, 8);
    if (t !== null && !TONES.includes(t)) fail(`${path}/${key}`, 'expected neutral, good, warn, bad, accent, info, water, gas or heat');
    return t || 'neutral';
  }
  function icon(o, path, required = false) {
    const name = string(o, 'icon', path, 24, required);
    if (name !== null && !ICONS.includes(name)) fail(`${path}/icon`, `unknown icon "${name}"`);
    return name;
  }
  function oneOf(o, key, path, values, message) {
    const v = string(o, key, path, key === 'direction' ? 12 : 8);
    if (v !== null && !values.includes(v)) fail(`${path}/${key}`, message);
    return v;
  }

  function component(e, path, depth) {
    const o = obj(e, path);
    if (depth > LIMITS.MAX_DEPTH) fail(path, `nested deeper than ${LIMITS.MAX_DEPTH} levels`);
    if (++components > LIMITS.MAX_COMPONENTS) fail(path, `more than ${LIMITS.MAX_COMPONENTS} components`);
    const type = string(o, 'type', path, 16, true);
    switch (type) {
      case 'value': return value(o, path);
      case 'rows': {
        allowOnly(o, path, ['type', 'items', 'tone']);
        array(o, 'items', path, 1, LIMITS.MAX_ROWS).forEach((item, i) => {
          const p = `${path}/items/${i}`;
          if (component(item, p, depth + 1) !== 'value') fail(p, 'rows can only hold value components');
        });
        tone(o, path);
        return type;
      }
      case 'gauge': gauge(o, path); return type;
      case 'flow': flow(o, path); return type;
      case 'sparkline': sparkline(o, path); return type;
      case 'text': {
        allowOnly(o, path, ['type', 'lines', 'icon', 'tone']);
        array(o, 'lines', path, 1, LIMITS.MAX_TEXT_LINES).forEach((l, i) => checkText(l, `${path}/lines/${i}`, LIMITS.MAX_TEXT_LINE));
        icon(o, path); tone(o, path);
        return type;
      }
      case 'stack': {
        allowOnly(o, path, ['type', 'items', 'direction', 'tone']);
        oneOf(o, 'direction', path, ['vertical', 'horizontal'], 'expected vertical or horizontal');
        array(o, 'items', path, 1, LIMITS.MAX_STACK_ITEMS).forEach((item, i) => component(item, `${path}/items/${i}`, depth + 1));
        tone(o, path);
        return type;
      }
      case 'image': {
        allowOnly(o, path, ['type', 'src', 'shape', 'description', 'tone']);
        const src = string(o, 'src', path, LIMITS.MAX_SRC, true);
        if (!src.startsWith('https://') && !src.startsWith('http://')) fail(`${path}/src`, 'expected an http(s) URL');
        oneOf(o, 'shape', path, ['square', 'round'], 'expected square or round');
        string(o, 'description', path, LIMITS.MAX_DESCRIPTION); tone(o, path);
        return type;
      }
      case 'actions': {
        allowOnly(o, path, ['type', 'items', 'tone']);
        const ids = array(o, 'items', path, 1, LIMITS.MAX_ACTIONS).map((e2, i) => {
          const p = `${path}/items/${i}`;
          const a = obj(e2, p);
          allowOnly(a, p, ['id', 'icon', 'label', 'tone', 'primary']);
          const id = string(a, 'id', p, LIMITS.MAX_ID, true);
          if (!ID.test(id)) fail(`${p}/id`, 'expected a-z, 0-9, - and _');
          icon(a, p, true); string(a, 'label', p, LIMITS.MAX_ACTION_LABEL); tone(a, p);
          return id;
        });
        if (new Set(ids).size !== ids.length) fail(`${path}/items`, 'action ids must be unique');
        tone(o, path);
        return type;
      }
      case 'progress': {
        allowOnly(o, path, ['type', 'value', 'min', 'max', 'at', 'running', 'label', 'time', 'style', 'tone']);
        const min = number(o, 'min', path) ?? 0;
        const max = number(o, 'max', path, true);
        if (max <= min) fail(`${path}/max`, 'expected more than min');
        const v = number(o, 'value', path, true);
        if (v < min || v > max) fail(`${path}/value`, 'expected min to max');
        if ('at' in o && (typeof o.at !== 'number' || !Number.isFinite(o.at))) fail(`${path}/at`, 'expected epoch milliseconds');
        oneOf(o, 'style', path, ['bar', 'marker'], 'expected bar or marker');
        string(o, 'label', path, LIMITS.MAX_LABEL); tone(o, path);
        return type;
      }
      case 'list': {
        allowOnly(o, path, ['type', 'rows', 'label', 'tone']);
        array(o, 'rows', path, 1, LIMITS.MAX_LIST_ROWS).forEach((e2, i) => {
          const p = `${path}/rows/${i}`;
          const r = obj(e2, p);
          allowOnly(r, p, ['title', 'time', 'detail', 'badge', 'icon', 'tone']);
          string(r, 'title', p, LIMITS.MAX_LIST_TITLE, true);
          string(r, 'time', p, LIMITS.MAX_LIST_TIME);
          string(r, 'detail', p, LIMITS.MAX_LIST_DETAIL);
          string(r, 'badge', p, LIMITS.MAX_LIST_BADGE);
          icon(r, p); tone(r, p);
        });
        string(o, 'label', path, LIMITS.MAX_LABEL); tone(o, path);
        return type;
      }
      case 'none':
        if (depth !== 1) fail(`${path}/type`, 'none can only be the whole view');
        allowOnly(o, path, ['type']);
        return type;
      default:
        return fail(`${path}/type`, `unknown component "${type}"`);
    }
  }

  function value(o, path) {
    allowOnly(o, path, ['type', 'value', 'unit', 'label', 'icon', 'icon_rotation', 'trend', 'tone']);
    const rotation = number(o, 'icon_rotation', path);
    if (rotation !== null && (rotation < 0 || rotation > 360)) fail(`${path}/icon_rotation`, 'expected degrees from 0 to 360');
    string(o, 'value', path, LIMITS.MAX_VALUE, true);
    string(o, 'unit', path, LIMITS.MAX_UNIT);
    string(o, 'label', path, LIMITS.MAX_LABEL);
    icon(o, path);
    const trend = string(o, 'trend', path, 8);
    if (trend !== null && !['up', 'down', 'flat'].includes(trend)) fail(`${path}/trend`, 'expected up, down or flat');
    tone(o, path);
    return 'value';
  }

  function gauge(o, path) {
    allowOnly(o, path, ['type', 'value', 'label', 'caption', 'icon', 'style', 'tone', 'negative_tone', 'sub']);
    const style = oneOf(o, 'style', path, ['ring', 'bar', 'dial'], 'expected ring, bar or dial') || 'ring';
    const v = number(o, 'value', path, true);
    if (style === 'dial') {
      if (v < -100 || v > 100) fail(`${path}/value`, 'expected a percentage from -100 to 100');
    } else {
      if (v < 0 || v > 100) fail(`${path}/value`, 'expected a percentage from 0 to 100');
      if ('negative_tone' in o) fail(`${path}/negative_tone`, 'only a dial has a negative side');
    }
    string(o, 'label', path, LIMITS.MAX_GAUGE_LABEL);
    string(o, 'caption', path, LIMITS.MAX_LABEL);
    icon(o, path); tone(o, path);
    if ('negative_tone' in o) tone(o, path, 'negative_tone');
    if ('sub' in o) {
      array(o, 'sub', path, 1, LIMITS.MAX_SUB).forEach((e, i) => {
        const p = `${path}/sub/${i}`;
        const so = obj(e, p);
        allowOnly(so, p, ['value', 'icon', 'tone']);
        string(so, 'value', p, LIMITS.MAX_SUB_TEXT, true); icon(so, p); tone(so, p);
      });
    }
  }

  function flow(o, path) {
    allowOnly(o, path, ['type', 'nodes', 'edges', 'tone']);
    const nodes = array(o, 'nodes', path, LIMITS.MIN_FLOW_NODES, LIMITS.MAX_FLOW_NODES).map((e, i) => {
      const p = `${path}/nodes/${i}`;
      const n = obj(e, p);
      allowOnly(n, p, ['id', 'icon', 'value', 'label', 'tone', 'percent']);
      const id = string(n, 'id', p, LIMITS.MAX_ID, true);
      if (!ID.test(id)) fail(`${p}/id`, 'ids use a-z, 0-9, - and _');
      icon(n, p, true);
      string(n, 'value', p, LIMITS.MAX_NODE_TEXT);
      string(n, 'label', p, LIMITS.MAX_NODE_TEXT);
      tone(n, p);
      const pc = number(n, 'percent', p);
      if (pc !== null && (pc < 0 || pc > 100)) fail(`${p}/percent`, 'expected 0 to 100');
      return id;
    });
    const index = new Map();
    nodes.forEach((id, i) => { if (index.has(id)) fail(`${path}/nodes/${i}/id`, `duplicate id "${id}"`); index.set(id, i); });
    const edges = 'edges' in o ? array(o, 'edges', path, 0, LIMITS.MAX_FLOW_EDGES) : [];
    edges.forEach((e, i) => {
      const p = `${path}/edges/${i}`;
      const ed = obj(e, p);
      allowOnly(ed, p, ['from', 'to', 'power']);
      const from = string(ed, 'from', p, LIMITS.MAX_ID, true);
      const to = string(ed, 'to', p, LIMITS.MAX_ID, true);
      const fi = index.has(from) ? index.get(from) : fail(`${p}/from`, `no node "${from}"`);
      const ti = index.has(to) ? index.get(to) : fail(`${p}/to`, `no node "${to}"`);
      if (fi === ti) fail(p, 'an edge needs two different nodes');
      const power = number(ed, 'power', p) ?? 0;
      if (power < 0) fail(`${p}/power`, 'power is a magnitude (>= 0); swap from and to for the other direction');
    });
    tone(o, path);
  }

  function sparkline(o, path) {
    allowOnly(o, path, ['type', 'points', 'min', 'max', 'label', 'value', 'show_range', 'tone', 'style', 'highlight', 'highlight_tone', 'marker']);
    const pts = array(o, 'points', path, LIMITS.MIN_POINTS, LIMITS.MAX_POINTS).map((e, i) => {
      if (e === null) return NaN;
      if (typeof e === 'number') {
        if (Number.isFinite(e) && Math.abs(e) <= LIMITS.MAX_MAGNITUDE) return e;
        return fail(`${path}/points/${i}`, 'expected a finite number or null');
      }
      if (typeof e === 'boolean') return fail(`${path}/points/${i}`, 'expected a finite number or null');
      return fail(`${path}/points/${i}`, 'expected a number or null');
    });
    if (pts.every(Number.isNaN)) fail(`${path}/points`, 'needs at least one number');
    const min = number(o, 'min', path);
    const max = number(o, 'max', path);
    if (min !== null && max !== null && min >= max) fail(`${path}/min`, 'min must be below max');
    if ('show_range' in o && typeof o.show_range !== 'boolean') fail(`${path}/show_range`, 'expected true or false');
    const index = (key) => {
      const v = number(o, key, path);
      if (v === null) return null;
      if (!Number.isInteger(v) || v < 0 || v >= pts.length) fail(`${path}/${key}`, `expected an index of points (0 to ${pts.length - 1})`);
      if (Number.isNaN(pts[v])) fail(`${path}/${key}`, 'points a gap (null)');
      return v;
    };
    const highlight = index('highlight');
    if ('highlight_tone' in o && highlight === null) fail(`${path}/highlight_tone`, 'needs highlight');
    string(o, 'label', path, LIMITS.MAX_LABEL);
    string(o, 'value', path, LIMITS.MAX_VALUE);
    tone(o, path);
    oneOf(o, 'style', path, ['line', 'bars'], 'expected line or bars');
    if ('highlight_tone' in o) tone(o, path, 'highlight_tone');
    index('marker');
  }

  try {
    component(element, '', 1);
    return null;
  } catch (e) {
    if (e instanceof ViewError) return { path: e.path || '/', reason: e.reason };
    throw e;
  }
}

/** Ajv's first error as { path, reason }, or null. */
export function schemaErrors(element) {
  const v = schemaValidator();
  if (v(element)) return null;
  // oneOf errors are noisy; report the deepest one, which is nearly always the real cause.
  const errs = [...v.errors].sort((a, b) => b.instancePath.length - a.instancePath.length);
  const e = errs.find((x) => x.keyword !== 'oneOf' && x.keyword !== 'const' && x.keyword !== 'if') || errs[0];
  return { path: e.instancePath || '/', reason: `${e.message}${e.params && e.params.additionalProperty ? ` (${e.params.additionalProperty})` : ''} [schema ${e.schemaPath}]` };
}

function walk(v, f) {
  if (!isObj(v)) return;
  f(v);
  if (v.type === 'stack' || v.type === 'rows') (v.items || []).forEach((x) => walk(x, f));
}

/**
 * Checks what render/detail/action returned (already through JSON, as the prelude sends it). Returns
 * { errors: [..], warnings: [..] }; a view with errors would not be drawn on the frame.
 */
export function checkView(view, { manifest = null, settings = {}, dns = null } = {}) {
  const errors = [], warnings = [];
  const text = JSON.stringify(view);
  if (Buffer.byteLength(text, 'utf8') > LIMITS.MAX_JSON_BYTES) {
    errors.push(`invalid view at /: view is larger than ${LIMITS.MAX_JSON_BYTES} bytes`);
    return { errors, warnings };
  }
  const frame = parseView(view);
  if (frame) errors.push(`invalid view at ${frame.path}: ${frame.reason}`);
  const schema = schemaErrors(view);
  if (schema) errors.push(`view doesn't match the schema at ${schema.path}: ${schema.reason}`);
  if (manifest && !errors.length) {
    walk(view, (c) => {
      if (c.type === 'actions' && !manifest.permissions.actions) errors.push(`${manifest.id} has no actions permission: a view with buttons is refused`);
      if (c.type === 'image') {
        try { authorize(c.src, { manifest, settings, dns }); } catch (e) { warnings.push(`image ${c.src} won't load on the frame: ${e.message}`); }
      }
    });
  }
  return { errors, warnings };
}
