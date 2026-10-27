// plugin.json as the frame reads it: a port of PluginManifest.parse (kinframe android/frame/.../js/PluginManifest.kt).
// Same rules, same order, same messages, so "passes the kit" means "the frame accepts it". Where the frame is lenient
// about JSON types (kotlinx's intOrNull/booleanOrNull also read "5" and "true" from strings) the kit is strict and
// says so: a manifest that only works by accident is a review finding, not a feature.

export const API = 1;
export const SETTING_TYPES = ['text', 'number', 'boolean', 'choice', 'url', 'secret', 'entity', 'color', 'duration', 'timezone'];
export const ID = /^[a-z0-9][a-z0-9-]*(\.[a-z0-9][a-z0-9-]*)+$/;
export const KEY = /^[a-z][a-z0-9_]{0,31}$/;
export const VERSION = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;
export const LOCAL_MIN_SECONDS = 5;
export const ORIGIN = /^https:\/\/[a-z0-9.-]+(:\d{1,5})?$/;
export const PLACEHOLDER = /\{([a-z][a-z0-9_]{0,31})\}/g;
export const MAX_PRESETS = 12;
export const VISIBILITY = ['always', 'on_change', 'on_tap'];

export class ManifestError extends Error {
  constructor(message) { super(message); this.name = 'ManifestError'; }
}

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const fail = (m) => { throw new ManifestError(m); };

/** Parses and validates plugin.json text (or an already parsed object). Returns the normalised manifest. */
export function parseManifest(input) {
  let o;
  if (typeof input === 'string') {
    try { o = JSON.parse(input); } catch { fail('not a JSON object'); }
  } else o = input;
  if (!isObj(o)) fail('not a JSON object');

  function str(key, from = o, required = true, max = 200) {
    if (!(key in from)) { if (required) fail(`missing ${key}`); return null; }
    const v = from[key];
    if (typeof v !== 'string') fail(`${key} must be a string`);
    if (v.length > max) fail(`${key} too long`);
    return v;
  }
  function int(key, from) {
    if (!(key in from)) return null;
    const v = from[key];
    if (typeof v !== 'number' || !Number.isInteger(v) || Math.abs(v) > 2147483647) fail(`${key} must be an integer`);
    return v;
  }
  function bool(v, what) {
    if (v === undefined) return false;
    if (typeof v !== 'boolean') fail(`${what} must be true or false`);
    return v;
  }

  const id = str('id');
  if (id.length > 64 || !ID.test(id)) fail('id must look like community.my-plugin');
  const version = str('version');
  if (!VERSION.test(version)) fail('version must be semver');
  const api = int('api', o);
  if (api === null) fail('missing api');
  if (api !== API) fail(`unsupported api ${api}`);

  let slots = ['top-left', 'top-right'];
  if ('slots' in o) {
    if (!Array.isArray(o.slots)) fail('slots must be an array'); // the frame falls back to both corners
    slots = o.slots.map((e) => (e === 'top-left' || e === 'top-right' ? e : fail(`unknown slot ${JSON.stringify(e)}`)));
  }

  if ('refresh' in o && !isObj(o.refresh)) fail('refresh must be an object');
  const r = isObj(o.refresh) ? o.refresh : {};
  const min = int('min_seconds', r) ?? 5;
  const def = int('default_seconds', r) ?? Math.max(min, 30);
  const stale = int('stale_seconds', r);
  if (min < 1 || def < min || def > 86400) fail('refresh: need 1 ≤ min_seconds ≤ default_seconds ≤ 86400');

  if ('settings' in o && !Array.isArray(o.settings)) fail('settings must be an array');
  const settings = (o.settings || []).map((s, i) => {
    if (!isObj(s)) fail(`settings[${i}] must be an object`);
    const key = str('key', s);
    if (!KEY.test(key)) fail(`settings[${i}].key must be snake_case`);
    const type = str('type', s);
    if (!SETTING_TYPES.includes(type)) fail(`settings[${i}].type unknown: ${type}`);
    const multiple = bool(s.multiple, `settings[${i}].multiple`);
    if (multiple && type !== 'entity') fail(`settings[${i}]: only entity settings can be multiple`);
    if ('options' in s && (!Array.isArray(s.options) || s.options.some((x) => typeof x !== 'string'))) fail(`settings[${i}].options must be a list of strings`);
    return {
      key, type,
      label: str('label', s, false) ?? key,
      required: bool(s.required, `settings[${i}].required`),
      default: 'default' in s && s.default !== null ? s.default : null,
      localOnly: bool(s.local_only, `settings[${i}].local_only`),
      options: s.options || [],
      discover: str('discover', s, false),
      help: str('help', s, false, 400),
      placeholder: str('placeholder', s, false),
      multiple,
    };
  });
  if (new Set(settings.map((s) => s.key)).size !== settings.length) fail('duplicate setting keys');

  if ('permissions' in o && !isObj(o.permissions)) fail('permissions must be an object');
  const p = isObj(o.permissions) ? o.permissions : {};
  const net = (kind) => {
    if (!(kind in p)) return [];
    if (!Array.isArray(p[kind])) fail(`permissions.${kind} must be an array`);
    return p[kind].map((v) => {
      if (typeof v !== 'string') fail(`permissions.${kind} entries are strings`);
      if (v.startsWith('settings.')) {
        const s = settings.find((x) => x.key === v.slice('settings.'.length));
        if (!s) fail(`permissions.${kind}: no setting ${v}`);
        if (s.type !== 'url') fail(`permissions.${kind}: ${v} is not a url setting`);
      } else if (!ORIGIN.test(v)) {
        fail(`permissions.${kind}: ${v} must be settings.<key> or an https origin`);
      }
      return v;
    });
  };
  const actions = bool(p.actions, 'permissions.actions');
  const location = bool(p.location, 'permissions.location');
  const http = net('http');
  // Every few seconds is for devices in the house, never for an internet API every frame would then call that often.
  if (min < LOCAL_MIN_SECONDS && http.some((v) => !v.startsWith('settings.') || !settings.some((s) => s.key === v.slice('settings.'.length) && s.localOnly))) {
    fail(`refresh: min_seconds below ${LOCAL_MIN_SECONDS} only for plugins whose http goes to local_only settings`);
  }
  const websocket = net('websocket');

  const dv = str('default_visibility', o, false);
  if (dv !== null && !VISIBILITY.includes(dv)) fail(`default_visibility must be one of ${VISIBILITY.join(', ')}`);
  const presets = parsePresets(o.presets, settings);

  return {
    id, name: str('name'), version, api,
    description: str('description', o, false, 400),
    slots,
    refresh: { minSeconds: min, defaultSeconds: def, staleSeconds: stale },
    permissions: { http, websocket, actions, location },
    settings,
    defaultVisibility: dv,
    presets,
    raw: o,
  };
}

function parsePresets(e, settings) {
  if (e === undefined) return [];
  if (!Array.isArray(e)) fail('presets must be an array');
  if (e.length > MAX_PRESETS) fail(`at most ${MAX_PRESETS} presets`);
  const presets = e.map((p, i) => {
    if (!isObj(p)) fail(`presets[${i}] must be an object`);
    const s = (key, max) => {
      const v = p[key];
      if (typeof v !== 'string') fail(`presets[${i}].${key} must be a string`);
      if (v.length === 0 || v.length > max) fail(`presets[${i}].${key} must be 1–${max} characters`);
      return v;
    };
    const id = s('id', 32);
    if (!KEY.test(id)) fail(`presets[${i}].id must be snake_case`);
    const label = s('label', 60);
    const values = p.settings;
    if (!isObj(values)) fail(`presets[${i}].settings must be an object`);
    if (!Object.keys(values).length) fail(`presets[${i}].settings is empty`);
    for (const [k, v] of Object.entries(values)) {
      const spec = settings.find((x) => x.key === k);
      if (!spec) fail(`presets[${i}]: no setting ${k}`);
      if (spec.type === 'secret') fail(`presets[${i}]: ${k} is a secret`);
      if (!fits(spec, v)) fail(`presets[${i}]: ${k} doesn't fit a ${spec.type} setting`);
    }
    const inputs = presetInputs(values);
    for (const k of inputs) {
      const spec = settings.find((x) => x.key === k);
      if (!spec) fail(`presets[${i}]: placeholder {${k}} names no setting`);
      if (spec.type !== 'text') fail(`presets[${i}]: placeholder {${k}} must be a text setting`);
      if (k in values) fail(`presets[${i}]: {${k}} is set by the preset itself`);
    }
    return { id, label, settings: values, inputs };
  });
  if (new Set(presets.map((p) => p.id)).size !== presets.length) fail('duplicate preset ids');
  return presets;
}

/** The text settings a preset's `{key}` placeholders need. */
export function presetInputs(values) {
  const out = [];
  const scan = (s) => { for (const m of s.matchAll(PLACEHOLDER)) if (!out.includes(m[1])) out.push(m[1]); };
  for (const v of Object.values(values)) {
    if (typeof v === 'string') scan(v);
    else if (Array.isArray(v)) v.forEach((x) => typeof x === 'string' && scan(x));
  }
  return out;
}

/** Whether a value fits a setting (a number for `number`, one of the options for `choice`, …). */
export function fits(spec, v) {
  switch (spec.type) {
    case 'number': return typeof v === 'number' && Number.isFinite(v);
    case 'boolean': return typeof v === 'boolean';
    case 'choice': return typeof v === 'string' && spec.options.includes(v);
    case 'entity': return typeof v === 'string' || (spec.multiple && Array.isArray(v) && v.every((x) => typeof x === 'string'));
    default: return typeof v === 'string';
  }
}

/** The owner's settings with the manifest's defaults filled in, as `ctx.settings` sees them. */
export function withDefaults(manifest, values) {
  const out = { ...values };
  for (const s of manifest.settings) if (s.default !== null && (out[s.key] === undefined || out[s.key] === null)) out[s.key] = s.default;
  return out;
}

/** The owner's values with preset `id` applied, or null while a placeholder's text setting is empty. */
export function applyPreset(manifest, id, values) {
  const p = manifest.presets.find((x) => x.id === id);
  if (!p) return null;
  const inputs = Object.fromEntries(p.inputs.map((k) => [k, typeof values[k] === 'string' || typeof values[k] === 'number' ? String(values[k]).trim() : '']));
  if (Object.values(inputs).some((v) => !v)) return null;
  const fill = (s) => s.replace(PLACEHOLDER, (_, k) => inputs[k]);
  const out = { ...values };
  for (const [k, v] of Object.entries(p.settings)) {
    out[k] = typeof v === 'string' ? fill(v) : Array.isArray(v) ? v.map((x) => (typeof x === 'string' ? fill(x) : x)) : v;
  }
  return out;
}
