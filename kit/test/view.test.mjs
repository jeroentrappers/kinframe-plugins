// Views: the frame's examples pass and its invalid views fail, both in the schema and in the validator port.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseView, schemaErrors, checkView } from '../src/view.mjs';
import { buildSchema } from '../src/schema.mjs';
import { SCHEMA } from '../src/schema.mjs';
import { HOST_DIR } from '../src/paths.mjs';
import { parseManifest } from '../src/manifest.mjs';

const dir = (k) => join(HOST_DIR, 'views', k);
const load = (k) => readdirSync(dir(k)).filter((f) => f.endsWith('.json')).map((f) => [f, JSON.parse(readFileSync(join(dir(k), f), 'utf8'))]);

test('every example is valid', () => {
  for (const [f, v] of load('examples')) {
    assert.equal(parseView(v), null, f);
    assert.equal(schemaErrors(v), null, f);
  }
});

test('every invalid view is refused by both', () => {
  for (const [f, v] of load('invalid')) {
    assert.ok(parseView(v), `validator accepted ${f}`);
    assert.ok(schemaErrors(v), `schema accepted ${f}`);
  }
});

test('what the kit\'s schema adds to upstream', () => {
  const cases = [
    { type: 'text', lines: ['   '] },
    { type: 'text', lines: ['a\u0085b'] },
    { type: 'sparkline', points: [1, 2], highlight_tone: 'good' },
    { type: 'sparkline', points: [1, 2e13] },
  ];
  for (const v of cases) {
    assert.ok(parseView(v), JSON.stringify(v));
    assert.ok(schemaErrors(v), JSON.stringify(v));
  }
});

test('the committed schema is the generated one', () => {
  assert.deepEqual(JSON.parse(readFileSync(SCHEMA, 'utf8')), buildSchema());
});

test('frame-only rules: depth, count, size, edges, indexes', () => {
  const v = (n) => ({ type: 'value', value: String(n) });
  assert.match(parseView({ type: 'stack', items: [{ type: 'stack', items: [{ type: 'stack', items: [v(1)] }] }] }).reason, /deeper/);
  assert.match(parseView({ type: 'flow', nodes: [{ id: 'a', icon: 'sun' }, { id: 'b', icon: 'home' }], edges: [{ from: 'a', to: 'c' }] }).reason, /no node "c"/);
  assert.match(parseView({ type: 'sparkline', points: [1, null, 3], marker: 1 }).reason, /gap/);
  assert.match(parseView({ type: 'progress', value: 5, min: 10, max: 20 }).reason, /min to max/);
  assert.match(parseView({ type: 'actions', items: [{ id: 'a', icon: 'play' }, { id: 'a', icon: 'pause' }] }).reason, /unique/);
  const big = { type: 'text', lines: ['x'], icon: 'sun', tone: 'good', padding: 'x'.repeat(17000) };
  assert.match(checkView(big).errors[0], /larger than 16384/);
});

test('host rules: buttons need the permission, images are checked against the network permissions', () => {
  const m = parseManifest({ id: 'community.x', name: 'X', version: '1.0.0', api: 1, permissions: { http: ['https://img.example.org'] } });
  assert.match(checkView({ type: 'actions', items: [{ id: 'a', icon: 'play' }] }, { manifest: m }).errors[0], /no actions permission/);
  assert.deepEqual(checkView({ type: 'image', src: 'https://img.example.org/a.jpg' }, { manifest: m }), { errors: [], warnings: [] });
  assert.match(checkView({ type: 'image', src: 'https://other.example/a.jpg' }, { manifest: m }).warnings[0], /won't load/);
});
