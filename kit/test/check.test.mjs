import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkCode, checkLicense, findSecrets, manifestKeyProblem, scrub } from '../src/check.mjs';
import { parseManifest } from '../src/manifest.mjs';

const errs = (src) => checkCode(src).errors;
const ok = 'export default { render(ctx) { return null; } };\n';

test('forbidden patterns', () => {
  for (const src of [
    'const x = eval("1");',
    'const f = Function("return 1");',
    'const f = new Function("a", "return a");',
    'const m = import("kinframe/ha");',
    "import fs from 'fs';",
    "import { x } from './util.js';",
    "export { x } from 'https://evil.example/x.js';",
    "import 'kinframe/nope';",
    'const r = require("fs");',
    'const F = (() => {}).constructor("return this");',
    'const e = globalThis.eval;',
  ]) assert.ok(errs(src + '\n' + ok).length > 0, `not caught: ${src}`);
});

test('only code counts, not comments or strings', () => {
  const src = `// don't eval( anything, or new Function(), or import('x')
/* require('fs') */
const s = "eval(1) Function( import('./x')";
const t = \`import x from 'fs'\`;
const re = /eval\\(/;
import * as ha from 'kinframe/ha';
import { series } from 'kinframe/series';
${ok}`;
  assert.deepEqual(errs(src), []);
  assert.match(scrub('a = "eval(";'), /a = " {5}";/);
});

test('minified code and a missing default export', () => {
  assert.ok(errs('const a = 1;' + ' '.repeat(400) + '\n' + ok).some((e) => /line of \d+ characters/.test(e)));
  assert.ok(errs('export function render() {}\n').some((e) => /export default/.test(e)));
});

test('API misuse is a warning', () => {
  const w = checkCode('const t = Date.now(); setTimeout(() => {}, 5); fetch("x");\n' + ok).warnings;
  assert.equal(w.length, 3);
});

test('licences', () => {
  assert.equal(checkLicense('MIT'), null);
  assert.equal(checkLicense('Apache-2.0'), null);
  assert.equal(checkLicense('MIT OR Apache-2.0'), null);
  assert.match(checkLicense(undefined), /missing/);
  assert.match(checkLicense('Proprietary'), /not an OSI-approved/);
  assert.match(checkLicense('CC-BY-NC-4.0'), /not an OSI-approved/);
});

test('secrets in fixtures', () => {
  const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJhYmNkZWZnaGlqa2wifQ.c2lnbmF0dXJlLXNpZ25hdHVyZQ';
  assert.ok(findSecrets(`{"token":"${jwt}"}`, 'f.json').length > 0);
  assert.ok(findSecrets('Authorization: Bearer abcdefghijklmnopqrstuvwxyz123456', 'f.txt').length > 0);
  assert.ok(findSecrets('{"url":"https://x.example/a?api_key=8f3a9c2e7b1d4f60aa"}', 'f.json').length > 0);
  assert.ok(findSecrets('{"api_key":"Zq8vT2nLx4KpR7mW9sYb3c"}', 'f.json').length > 0);
  assert.ok(findSecrets('-----BEGIN PRIVATE KEY-----\nabc', 'k').length > 0);
  assert.deepEqual(findSecrets('{"token":"test-token","station":"Denderleeuw","sha":"deadbeef"}', 'f.json'), []);
});

test('translation keys must name the manifest', () => {
  const m = parseManifest({ id: 'community.x', name: 'X', version: '1.0.0', api: 1, settings: [{ key: 'zone', type: 'choice', options: ['BE', 'NL'] }, { key: 'url', type: 'url' }],
    presets: [{ id: 'home', label: 'Home', settings: { zone: 'BE' } }] });
  for (const k of ['@name', '@description', '@setting.zone', '@setting.url.help', '@setting.url.placeholder', '@option.zone.BE', '@preset.home']) assert.equal(manifestKeyProblem(k, m), null, k);
  for (const k of ['@setting.nope', '@option.zone.FR', '@option.url.x', '@preset.away', '@title', '@setting.zone.label']) assert.ok(manifestKeyProblem(k, m), k);
});
