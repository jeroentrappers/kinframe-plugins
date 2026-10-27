// `kit check`: everything a reviewer shouldn't have to check by eye. The manifest rules as the frame applies them
// (manifest.mjs), plus what the registry asks of a community plugin: the folder is the id, an OSI licence as an SPDX
// id, translations that name real settings, code without eval/Function/dynamic import/foreign imports, not minified,
// within the size limits of a bundle (§7.1), and fixtures and scenarios without anything that looks like a secret.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fits } from './manifest.mjs';
import { scenarioFiles, lintScenario } from './scenario.mjs';
import { bundleFiles, zipFiles, BUNDLE_LIMITS } from './bundle.mjs';
import { hostSources } from './sandbox.mjs';

export const MAX_CODE_BYTES = 256 * 1024;
export const MAX_LINE = 300;

/** OSI-approved licences, by SPDX id (the common ones; extend when a plugin needs another). */
export const OSI_LICENSES = [
  '0BSD', 'AFL-3.0', 'AGPL-3.0-only', 'AGPL-3.0-or-later', 'Apache-2.0', 'Artistic-2.0', 'BSD-2-Clause', 'BSD-3-Clause',
  'BSL-1.0', 'CDDL-1.0', 'CECILL-2.1', 'ECL-2.0', 'EPL-1.0', 'EPL-2.0', 'EUPL-1.1', 'EUPL-1.2', 'GPL-2.0-only',
  'GPL-2.0-or-later', 'GPL-3.0-only', 'GPL-3.0-or-later', 'ISC', 'LGPL-2.1-only', 'LGPL-2.1-or-later', 'LGPL-3.0-only',
  'LGPL-3.0-or-later', 'MIT', 'MIT-0', 'MPL-2.0', 'MulanPSL-2.0', 'NCSA', 'OSL-3.0', 'PostgreSQL', 'UPL-1.0', 'Unlicense',
  'Zlib',
];

const MANIFEST_KEYS = ['id', 'name', 'version', 'api', 'author', 'license', 'description', 'homepage', 'slots', 'refresh', 'permissions', 'settings', 'default_visibility', 'presets'];
const SETTING_KEYS = ['key', 'type', 'label', 'help', 'placeholder', 'required', 'default', 'local_only', 'options', 'discover', 'multiple', 'domain', 'unit'];
const PERMISSION_KEYS = ['http', 'websocket', 'actions', 'location'];
const REFRESH_KEYS = ['min_seconds', 'default_seconds', 'stale_seconds'];
const LOCALE_TAG = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;

/** A licence expression of OSI ids: "MIT", "MIT OR Apache-2.0", "(MIT AND Zlib)". */
export function checkLicense(expr) {
  if (typeof expr !== 'string' || !expr.trim()) return 'license is missing: name an OSI-approved licence by its SPDX id (e.g. "MIT", "Apache-2.0")';
  const ids = expr.replace(/[()]/g, ' ').split(/\s+(?:OR|AND)\s+|\s+/).filter(Boolean);
  const bad = ids.filter((x) => !OSI_LICENSES.includes(x.replace(/\+$/, '')));
  if (bad.length) return `license ${JSON.stringify(expr)}: ${bad.join(', ')} is not an OSI-approved SPDX id the kit knows (${'see kit/src/check.mjs'})`;
  return null;
}

/**
 * Strips comments and the contents of strings and template literals (keeping their quotes), so the pattern checks see
 * only code. Returns { code, strings } where `strings` holds every string literal's text, for the import checks.
 */
export function scrub(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  let lastSignificant = '';
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === '/' && d === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && d === '*') { const e = src.indexOf('*/', i + 2); const end = e < 0 ? n : e + 2; out += src.slice(i, end).replace(/[^\n]/g, ' '); i = end; continue; }
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      let depth = 0;
      while (j < n) {
        if (src[j] === '\\') { j += 2; continue; }
        if (c === '`' && src[j] === '$' && src[j + 1] === '{') { depth++; j += 2; continue; }
        if (c === '`' && depth > 0 && src[j] === '}') { depth--; j++; continue; }
        if (src[j] === c && depth === 0) break;
        j++;
      }
      out += c + src.slice(i + 1, j).replace(/[^\n]/g, ' ') + c;
      i = j + 1; lastSignificant = c; continue;
    }
    // A regular expression literal where an expression may start.
    if (c === '/' && /[(,=:[!&|?{};+\-*%<>~^]|^$/.test(lastSignificant)) {
      let j = i + 1, cls = false;
      while (j < n && src[j] !== '\n') {
        if (src[j] === '\\') { j += 2; continue; }
        if (src[j] === '[') cls = true; else if (src[j] === ']') cls = false;
        else if (src[j] === '/' && !cls) break;
        j++;
      }
      out += '/' + ' '.repeat(Math.max(0, j - i - 1)) + '/';
      i = j + 1; lastSignificant = '/'; continue;
    }
    out += c;
    if (!/\s/.test(c)) lastSignificant = c;
    i++;
  }
  return out;
}

/** The forbidden-pattern and import checks on main.js. Returns { errors, warnings }. */
export function checkCode(src, libraries = Object.keys(hostSources().libraries)) {
  const errors = [], warnings = [];
  const code = scrub(src);
  const lineOf = (idx) => code.slice(0, idx).split('\n').length;
  const rules = [
    [/\beval\b/g, 'eval: code from text is not allowed'],
    [/\bFunction\s*\(/g, 'Function(…): code from text is not allowed'],
    [/\bnew\s+Function\b/g, 'new Function: code from text is not allowed'],
    [/\bimport\s*\(/g, 'dynamic import(): a plugin is one module; only static imports of the host libraries'],
    [/(\.|\[\s*['"`])constructor\b\s*['"`]?\s*\]?\s*\(/g, '.constructor(…) can reach Function: not allowed'],
    [/\brequire\s*\(/g, 'require(): there is no module system besides the host libraries'],
  ];
  const hints = [
    [/(?<![.\w$])(?:fetch|XMLHttpRequest|WebSocket)\s*\(/g, 'fetch/XMLHttpRequest/WebSocket don\'t exist on the frame: use ctx.http and ctx.ws'],
    [/(?<![.\w$])(?:setTimeout|setInterval)\b/g, 'don\'t count on timers on the frame: the host calls update every refresh interval, invalidate() asks for a render'],
    [/(?<![.\w$])Date\.now\s*\(/g, 'Date.now() is the device\'s clock; ctx.now() is the frame\'s (and the one scenarios set)'],
  ];
  for (const [re, msg] of rules) {
    for (const m of code.matchAll(re)) errors.push(`main.js:${lineOf(m.index)}: ${msg}`);
  }
  for (const [re, msg] of hints) {
    for (const m of code.matchAll(re)) warnings.push(`main.js:${lineOf(m.index)}: ${msg}`);
  }
  // Imports and re-exports: only `kinframe/<library>`, and only libraries the host has.
  const importRe = /(?:^|[;\n}])\s*(import|export)\b([^;'"`]*?)\bfrom\s*(['"])([^'"]*)\3|(?:^|[;\n}])\s*import\s*(['"])([^'"]*)\5/g;
  for (const m of src.matchAll(importRe)) {
    // Only count it when the statement is code, not inside a comment or string.
    const at = m.index + m[0].search(/\S/);
    if (code[at] !== src[at]) continue;
    const spec = m[4] ?? m[6];
    if (!spec.startsWith('kinframe/')) errors.push(`main.js:${src.slice(0, at).split('\n').length}: import '${spec}': a plugin can only import the host's libraries (${libraries.join(', ')})`);
    else if (!libraries.includes(spec)) errors.push(`main.js:${src.slice(0, at).split('\n').length}: import '${spec}': no such host library (${libraries.join(', ')})`);
  }
  if (!/\bexport\s+default\b/.test(code)) errors.push('main.js: needs `export default { … }` with the plugin\'s functions');
  // Minified or generated code can't be reviewed.
  const lines = src.split('\n');
  lines.forEach((l, i) => { if (l.length > MAX_LINE) errors.push(`main.js:${i + 1}: line of ${l.length} characters (at most ${MAX_LINE}); minified or generated code can't be reviewed`); });
  const codeLines = lines.filter((l) => l.trim());
  if (codeLines.length > 5 && codeLines.reduce((a, l) => a + l.length, 0) / codeLines.length > 160) errors.push('main.js: looks minified (very long lines on average)');
  return { errors, warnings };
}

// Things that look like credentials. Fixtures are recorded from real services; a token in one is published forever.
const SECRET_PATTERNS = [
  [/eyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/, 'a JSON Web Token (a Home Assistant token looks like this)'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'a private key'],
  [/\bAKIA[0-9A-Z]{16}\b/, 'an AWS access key'],
  [/\bgh[pousr]_[A-Za-z0-9]{30,}\b/, 'a GitHub token'],
  [/\bglpat-[A-Za-z0-9_-]{20,}\b/, 'a GitLab token'],
  [/\bxox[abposr]-[A-Za-z0-9-]{10,}\b/, 'a Slack token'],
  [/\bsk-[A-Za-z0-9_-]{20,}\b/, 'an API secret key'],
  [/\bAIza[0-9A-Za-z_-]{35}\b/, 'a Google API key'],
  [/[Bb]earer\s+[A-Za-z0-9._~+/-]{20,}=*/, 'a bearer token'],
  [/[?&](?:api_?key|apikey|token|access_token|key|secret|password|sig|signature)=[A-Za-z0-9._~%+/-]{12,}/i, 'a credential in a URL'],
];
const SECRET_KEY = /^(?:.*_)?(?:token|secret|password|passwd|api_?key|apikey|access_key|private_key|client_secret|auth|authorization|cookie|session)$/i;

function entropy(s) {
  const f = {};
  for (const c of s) f[c] = (f[c] || 0) + 1;
  return Object.values(f).reduce((a, n) => a - (n / s.length) * Math.log2(n / s.length), 0);
}

/** Looks for secrets in a fixture's or scenario's text; returns findings. */
export function findSecrets(text, file) {
  const out = [];
  for (const [re, what] of SECRET_PATTERNS) {
    const m = re.exec(text);
    if (m) out.push(`${file}:${text.slice(0, m.index).split('\n').length}: looks like ${what}; replace it with a placeholder such as "test-token"`);
  }
  // JSON keys named like a credential with a long, random-looking value.
  let json = null;
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  const walk = (v, path) => {
    if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}[${i}]`));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) {
      if (typeof x === 'string' && SECRET_KEY.test(k) && x.length >= 16 && entropy(x) > 3.5) out.push(`${file}: ${path}.${k} looks like a real credential; use a placeholder such as "test-token"`);
      walk(x, `${path}.${k}`);
    }
  };
  if (json !== null) walk(json, '$');
  return out;
}

function listFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? listFiles(p) : [p];
  });
}

/** Checks one plugin folder. Returns { id, errors, warnings }. */
export function checkPlugin(plugin) {
  const errors = [], warnings = [];
  const { dir, folder, raw, manifest } = plugin;
  if (plugin.manifestError) errors.push(`plugin.json: ${plugin.manifestError}`);
  if (raw && typeof raw === 'object') {
    for (const k of Object.keys(raw)) if (!MANIFEST_KEYS.includes(k)) warnings.push(`plugin.json: unknown key "${k}" (the frame ignores it)`);
    if (raw.permissions && typeof raw.permissions === 'object') for (const k of Object.keys(raw.permissions)) if (!PERMISSION_KEYS.includes(k)) errors.push(`plugin.json: unknown permission "${k}"`);
    if (raw.refresh && typeof raw.refresh === 'object') for (const k of Object.keys(raw.refresh)) if (!REFRESH_KEYS.includes(k)) errors.push(`plugin.json: unknown refresh key "${k}"`);
    (Array.isArray(raw.settings) ? raw.settings : []).forEach((s, i) => {
      if (s && typeof s === 'object') for (const k of Object.keys(s)) if (!SETTING_KEYS.includes(k)) warnings.push(`plugin.json: settings[${i}]: unknown key "${k}"`);
    });
    const lic = checkLicense(raw.license);
    if (lic) errors.push(`plugin.json: ${lic}`);
    const a = raw.author;
    if (!a || typeof a !== 'object' || typeof a.name !== 'string' || !a.name.trim()) errors.push('plugin.json: author needs a name ({ "name": "…", "url": "…" })');
    if (typeof raw.description !== 'string' || !raw.description.trim()) errors.push('plugin.json: description is missing (the catalog shows it)');
  }
  if (manifest) {
    if (manifest.id !== folder) errors.push(`plugin.json: id ${manifest.id} must be the folder's name (${folder})`);
    if (!manifest.id.startsWith('community.')) errors.push(`plugin.json: id ${manifest.id}: plugins in this repository start with "community." (kinframe.* ship with the frame app)`);
    for (const s of manifest.settings) {
      if (s.type === 'choice' && !s.options.length) errors.push(`plugin.json: setting ${s.key}: a choice needs options`);
      if (s.default !== null && !fits(s, s.default)) errors.push(`plugin.json: setting ${s.key}: default ${JSON.stringify(s.default)} doesn't fit a ${s.type} setting`);
      if (s.type === 'secret' && s.default !== null) errors.push(`plugin.json: setting ${s.key}: a secret can't have a default`);
      if (s.localOnly && s.type !== 'url') warnings.push(`plugin.json: setting ${s.key}: local_only only means something on a url setting`);
    }
    if (manifest.settings.some((s) => s.type === 'entity')) {
      const b = manifest.settings.find((s) => s.key === 'base_url'), t = manifest.settings.find((s) => s.key === 'token');
      if (!b || b.type !== 'url' || !t || t.type !== 'secret') errors.push('plugin.json: a plugin with entity settings names its connection base_url (url) and token (secret), §6.2');
    }
  }

  // Code.
  if (plugin.main === null) errors.push('main.js is missing');
  else {
    const bytes = Buffer.byteLength(plugin.main, 'utf8');
    if (bytes > MAX_CODE_BYTES) errors.push(`main.js is ${Math.ceil(bytes / 1024)} KB (at most ${MAX_CODE_BYTES / 1024} KB)`);
    const c = checkCode(plugin.main);
    errors.push(...c.errors); warnings.push(...c.warnings);
  }

  // Translations.
  const ld = join(dir, 'locales');
  const tags = existsSync(ld) ? readdirSync(ld) : [];
  for (const f of tags) {
    const tag = f.replace(/\.json$/, '');
    if (!f.endsWith('.json') || !LOCALE_TAG.test(tag)) { errors.push(`locales/${f}: expected <language tag>.json (en.json, nl.json, zh-CN.json)`); continue; }
    let o;
    try { o = JSON.parse(readFileSync(join(ld, f), 'utf8')); } catch (e) { errors.push(`locales/${f}: not valid JSON: ${e.message}`); continue; }
    if (!o || typeof o !== 'object' || Array.isArray(o)) { errors.push(`locales/${f}: must be an object of strings`); continue; }
    for (const [k, v] of Object.entries(o)) {
      if (typeof v !== 'string') errors.push(`locales/${f}: ${k} must be a string`);
      if (k.startsWith('@') && manifest) {
        const why = manifestKeyProblem(k, manifest);
        if (why) errors.push(`locales/${f}: ${k}: ${why}`);
      }
    }
  }
  if (!tags.includes('en.json')) warnings.push('locales/en.json is missing: ctx.t falls back to the key itself, and English is the fallback for every language');
  else if (plugin.main) {
    const en = plugin.locales.en || {};
    for (const m of scrubStringsOnly(plugin.main).matchAll(/\bctx\.t\(\s*(['"])([^'"]+)\1/g)) {
      if (!(m[2] in en)) warnings.push(`main.js: ctx.t('${m[2]}') has no text in locales/en.json`);
    }
    for (const t of Object.keys(plugin.locales)) {
      if (t === 'en') continue;
      const missing = Object.keys(en).filter((k) => !k.startsWith('@') && !(k in plugin.locales[t]));
      if (missing.length) warnings.push(`locales/${t}.json lacks ${missing.join(', ')} (English is shown instead)`);
    }
  }

  // Files and documentation.
  for (const f of ['plugin.json', 'README.md', 'main.js', ...tags.map((t) => `locales/${t}`)]) {
    const p = join(dir, f);
    if (existsSync(p) && /\bTODO\b/.test(readFileSync(p, 'utf8'))) errors.push(`${f}: still has a TODO`);
  }
  if (!existsSync(join(dir, 'README.md'))) errors.push('README.md is missing (the catalog shows it: what the plugin does, how to set it up)');
  for (const f of readdirSync(dir)) {
    if (!['plugin.json', 'main.js', 'locales', 'fixtures', 'scenarios', 'README.md', 'icon.svg', 'jsconfig.json'].includes(f)) warnings.push(`${f}: not part of a plugin folder (not bundled)`);
  }
  const scenarios = scenarioFiles(dir);
  if (!scenarios.length) errors.push('scenarios/: no scenario; add at least one that runs update and render on a fixture');
  if (manifest) {
    for (const s of scenarios) {
      let sc;
      try { sc = JSON.parse(readFileSync(s, 'utf8')); } catch (e) { errors.push(`${relative(dir, s)}: not valid JSON: ${e.message}`); continue; }
      lintScenario(sc, manifest, dir).forEach((p) => errors.push(`${relative(dir, s)}: ${p}`));
    }
  }
  for (const f of [...listFiles(join(dir, 'fixtures')), ...listFiles(join(dir, 'scenarios'))]) {
    findSecrets(readFileSync(f, 'utf8'), relative(dir, f)).forEach((x) => errors.push(x));
  }

  // The bundle as it would be published (§7.1).
  if (manifest && plugin.main !== null) {
    try {
      const files = bundleFiles(dir);
      const unpacked = files.reduce((a, f) => a + f.data.length, 0);
      const zip = zipFiles(files);
      if (zip.length > BUNDLE_LIMITS.zipBytes) errors.push(`bundle is ${Math.ceil(zip.length / 1024)} KB (at most ${BUNDLE_LIMITS.zipBytes / 1024} KB)`);
      if (unpacked > BUNDLE_LIMITS.unpackedBytes) errors.push(`bundle unpacks to ${Math.ceil(unpacked / 1024)} KB (at most ${BUNDLE_LIMITS.unpackedBytes / 1024} KB)`);
    } catch (e) { errors.push(`bundle: ${e.message}`); }
  }
  return { id: manifest ? manifest.id : folder, errors, warnings };
}

function scrubStringsOnly(src) {
  // Comments out, strings kept: for finding ctx.t('key') calls.
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
}

/** Why an `@` key in a locale doesn't name the manifest's text, or null when it does (§6.1). */
export function manifestKeyProblem(k, manifest) {
  if (k === '@name' || k === '@description') return null;
  let m;
  if ((m = /^@setting\.([a-z][a-z0-9_]*)(?:\.(help|placeholder))?$/.exec(k))) {
    return manifest.settings.some((s) => s.key === m[1]) ? null : `no setting "${m[1]}" in plugin.json`;
  }
  if ((m = /^@option\.([a-z][a-z0-9_]*)\.(.+)$/.exec(k))) {
    const s = manifest.settings.find((x) => x.key === m[1]);
    if (!s) return `no setting "${m[1]}" in plugin.json`;
    if (s.type !== 'choice') return `setting "${m[1]}" is not a choice`;
    return s.options.includes(m[2]) ? null : `"${m[2]}" is not one of ${m[1]}'s options (${s.options.join(', ')})`;
  }
  if ((m = /^@preset\.([a-z][a-z0-9_]*)$/.exec(k))) {
    return manifest.presets.some((p) => p.id === m[1]) ? null : `no preset "${m[1]}" in plugin.json`;
  }
  return 'unknown manifest key (@name, @description, @setting.<key>[.help|.placeholder], @option.<key>.<value>, @preset.<id>)';
}
