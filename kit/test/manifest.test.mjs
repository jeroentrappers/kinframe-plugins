// The frame's manifest rules (PluginManifest.kt), with the cases of QuickJsSandboxTest.manifestValidation and
// PluginCtxTest (presets, default_visibility, location).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseManifest, applyPreset, withDefaults, ManifestError } from '../src/manifest.mjs';
import { pluginDirs, readPlugin } from '../src/plugins.mjs';

const bad = (m) => assert.throws(() => parseManifest(m), ManifestError, `accepted: ${m}`);

test('the frame refuses these manifests', () => {
  [
    '{"id":"Bad Id","name":"x","version":"1.0.0","api":1}',
    '{"id":"community.x","name":"x","version":"1.0","api":1}',
    '{"id":"community.x","name":"x","version":"1.0.0","api":2}',
    '{"id":"community.x","name":"x","version":"1.0.0","api":1,"permissions":{"http":["http://plain.example"]}}',
    '{"id":"community.x","name":"x","version":"1.0.0","api":1,"permissions":{"http":["settings.nope"]}}',
    '{"id":"community.x","name":"x","version":"1.0.0","api":1,"settings":[{"key":"a","type":"text"}],"permissions":{"http":["settings.a"]}}',
    '{"id":"community.x","name":"x","version":"1.0.0","api":1,"refresh":{"min_seconds":0}}',
    // Every second only for devices in the house, never for an internet API.
    '{"id":"community.x","name":"x","version":"1.0.0","api":1,"refresh":{"min_seconds":1},"permissions":{"http":["https://api.example.org"]}}',
    '{"id":"community.x","name":"x","version":"1.0.0","api":1,"refresh":{"min_seconds":1},"settings":[{"key":"a","type":"url"}],"permissions":{"http":["settings.a"]}}',
    '{"id":"community.x","version":"1.0.0","api":1}',
    '{"id":"community.x","name":"x","version":"1.0.0","api":1,"slots":["bottom"]}',
    '{"id":"community.x","name":"x","version":"1.0.0","api":1,"settings":[{"key":"Bad","type":"text"}]}',
    '{"id":"community.x","name":"x","version":"1.0.0","api":1,"settings":[{"key":"a","type":"colour"}]}',
    '{"id":"community.x","name":"x","version":"1.0.0","api":1,"settings":[{"key":"a","type":"text"},{"key":"a","type":"text"}]}',
    '{"id":"community.x","name":"x","version":"1.0.0","api":1,"settings":[{"key":"a","type":"text","multiple":true}]}',
    '{"id":"community.x","name":"x","version":"1.0.0","api":1,"refresh":{"min_seconds":60,"default_seconds":30}}',
    '{"id":"community.x","name":"x","version":"1.0.0","api":1,"refresh":{"default_seconds":90000}}',
    '{"id":"community.x","name":"x","version":"1.0.0","api":1,"default_visibility":"sometimes"}',
    '{"id":"community.x","name":"x","version":"1.0.0","api":1,"permissions":{"location":"yes"}}',
    'not json',
  ].forEach(bad);
});

test('local devices may refresh every second', () => {
  const m = parseManifest('{"id":"community.x","name":"x","version":"1.0.0","api":1,"refresh":{"min_seconds":1,"default_seconds":1},"settings":[{"key":"a","type":"url","local_only":true}],"permissions":{"http":["settings.a"]}}');
  assert.equal(m.refresh.minSeconds, 1);
  assert.deepEqual(m.slots, ['top-left', 'top-right']);
});

test('defaults: refresh, slots, labels, settings defaults', () => {
  const m = parseManifest({ id: 'community.x', name: 'X', version: '1.2.3-beta.1', api: 1, settings: [{ key: 'n', type: 'number', default: 7 }, { key: 's', type: 'text' }] });
  assert.deepEqual(m.refresh, { minSeconds: 5, defaultSeconds: 30, staleSeconds: null });
  assert.equal(m.settings[1].label, 's');
  assert.deepEqual(withDefaults(m, { s: 'a' }), { s: 'a', n: 7 });
  assert.deepEqual(withDefaults(m, { n: 3 }), { n: 3 });
});

const PRESET_BASE = (extra = '', permissions = '{}') => `{"id":"community.test","name":"Test","version":"1.0.0","api":1,"permissions":${permissions}${extra},
  "settings":[{"key":"prefix","type":"text"},{"key":"level","type":"entity"},{"key":"range","type":"entity"},
  {"key":"panels","type":"entity","multiple":true},{"key":"style","type":"choice","options":["ring","bar"]},
  {"key":"max","type":"number"},{"key":"on","type":"boolean"},{"key":"token","type":"secret"}]}`;

test('presets fill settings from a prefix', () => {
  const m = parseManifest(PRESET_BASE(`,"presets":[
    {"id":"kia","label":"Kia / Hyundai (Kia Connect)","settings":{"level":"sensor.{prefix}_ev_battery_level","range":"sensor.{prefix}_ev_range","style":"ring"}},
    {"id":"solar","label":"Two inverters","settings":{"panels":["sensor.a_power","sensor.b_power"],"max":5000,"on":true}}]`));
  assert.deepEqual(m.presets.map((p) => p.id), ['kia', 'solar']);
  assert.deepEqual(m.presets[0].inputs, ['prefix']);
  assert.equal(applyPreset(m, 'kia', { prefix: ' ' }), null);
  const v = applyPreset(m, 'kia', { prefix: 'ev3', max: 80 });
  assert.equal(v.level, 'sensor.ev3_ev_battery_level');
  assert.equal(v.range, 'sensor.ev3_ev_range');
  assert.equal(v.style, 'ring');
  assert.equal(v.max, 80);
  assert.deepEqual(applyPreset(m, 'solar', {}).panels, ['sensor.a_power', 'sensor.b_power']);
  assert.equal(applyPreset(m, 'nope', {}), null);
});

test('preset validation', () => {
  const ok = '{"id":"p","label":"P","settings":{"level":"sensor.x"}}';
  [
    ',"presets":{}',
    ',"presets":[{"id":"P-1","label":"P","settings":{"level":"x"}}]',
    ',"presets":[{"id":"p","label":"","settings":{"level":"x"}}]',
    ',"presets":[{"id":"p","label":"P","settings":{}}]',
    ',"presets":[{"id":"p","label":"P","settings":{"nope":"x"}}]',
    ',"presets":[{"id":"p","label":"P","settings":{"token":"abc"}}]',
    ',"presets":[{"id":"p","label":"P","settings":{"style":"donut"}}]',
    ',"presets":[{"id":"p","label":"P","settings":{"max":"5000"}}]',
    ',"presets":[{"id":"p","label":"P","settings":{"on":1}}]',
    ',"presets":[{"id":"p","label":"P","settings":{"level":["a","b"]}}]',
    ',"presets":[{"id":"p","label":"P","settings":{"level":"sensor.{unknown}"}}]',
    ',"presets":[{"id":"p","label":"P","settings":{"level":"sensor.{max}"}}]',
    ',"presets":[{"id":"p","label":"P","settings":{"prefix":"a","level":"sensor.{prefix}"}}]',
    `,"presets":[${ok},${ok}]`,
    `,"presets":[${Array.from({ length: 13 }, (_, i) => ok.replace('"p"', `"p${i}"`)).join(',')}]`,
  ].forEach((extra) => bad(PRESET_BASE(extra)));
  bad(PRESET_BASE('', '{"location":"yes"}'));
  parseManifest(PRESET_BASE(`,"presets":[${ok}]`));
  assert.equal(parseManifest(PRESET_BASE(',"default_visibility":"on_change","slots":["top-left"]')).defaultVisibility, 'on_change');
});

test('every plugin in the repository has a valid manifest named like its folder', () => {
  for (const dir of pluginDirs()) {
    const p = readPlugin(dir);
    assert.equal(p.manifestError, null, `${p.folder}: ${p.manifestError}`);
    assert.equal(p.manifest.id, p.folder);
  }
});
