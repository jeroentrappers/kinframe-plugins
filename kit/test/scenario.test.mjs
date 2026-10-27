// A scenario run end to end on a plugin written to a temporary folder: stubs, steps, snapshot write and compare.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readPlugin } from '../src/plugins.mjs';
import { testScenario, runScenario } from '../src/scenario.mjs';
import { checkPlugin } from '../src/check.mjs';
import { files } from '../src/new.mjs';

function plugin(id = 'community.demo', overrides = {}) {
  const root = mkdtempSync(join(tmpdir(), 'kit-'));
  const dir = join(root, id);
  for (const [f, text] of Object.entries({ ...files(id, { author: 'Test' }), ...overrides })) {
    mkdirSync(join(dir, f, '..'), { recursive: true });
    writeFileSync(join(dir, f), text);
  }
  return { dir, root, file: join(dir, 'scenarios', 'brussels.json') };
}

test('a scaffolded plugin runs, its snapshot is written and then matches', async () => {
  const { dir, root, file } = plugin();
  try {
    const p = readPlugin(dir);
    const first = await testScenario(p, file);
    assert.match(first.errors[0], /no snapshot/);
    const upd = await testScenario(p, file, { update: true });
    assert.deepEqual(upd.errors, []);
    assert.ok(upd.updated);
    const snap = JSON.parse(readFileSync(join(dir, 'scenarios', 'brussels.snap.json'), 'utf8'));
    assert.equal(snap.steps[2].view.value, '21.4 °C');
    assert.equal(snap.steps[3].view.items[1].lines[0], 'Updated 8 min ago');
    assert.deepEqual((await testScenario(p, file)).errors, []);
    // A change in what the plugin draws shows up as a diff.
    writeFileSync(join(dir, 'locales', 'en.json'), readFileSync(join(dir, 'locales', 'en.json'), 'utf8').replace('Right now', 'Now'));
    const changed = await testScenario(readPlugin(dir), file);
    assert.match(changed.errors[0], /differs from its snapshot[\s\S]*- +"label": "Right now",\n\+ +"label": "Now",/);
    // kit check: the scaffold runs but its TODOs are errors until filled in.
    assert.ok(checkPlugin(readPlugin(dir)).errors.every((e) => /TODO/.test(e)));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('an unmatched request, a missing setting, an invalid view and an expected error', async () => {
  const sc = (o) => JSON.stringify({ language: 'en', settings: { place: 'Brussels' }, ...o });
  const { dir, root } = plugin('community.demo', {
    'scenarios/unmatched.json': sc({ http: [{ url: 'https://api.example.org/other', body: {} }] }),
    'scenarios/bad-setting.json': sc({ settings: { nope: 1 } }),
    'scenarios/expected.json': sc({ http: [{ urlPattern: '^https://api\\.example\\.org/v1/', status: 503, body: 'down' }], steps: [{ call: 'update', expect_error: 'HTTP 503' }] }),
    'scenarios/invalid-view.json': sc({ http: [{ urlPattern: '^https://api\\.example\\.org/v1/', body: { value: 1, unit: 'a very long unit', time: 'x' } }] }),
  });
  try {
    const p = readPlugin(dir);
    const r = (n) => runScenario(p, join(dir, 'scenarios', n + '.json'));
    assert.match((await r('unmatched')).errors.join('\n'), /no stub for GET https:\/\/api.example.org\/v1\/value\?place=Brussels/);
    assert.match((await r('bad-setting')).errors.join('\n'), /settings.nope: no such setting/);
    assert.deepEqual((await r('expected')).errors, []);
    assert.match((await r('invalid-view')).errors.join('\n'), /render: invalid view at \/value: longer than 16 characters/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
