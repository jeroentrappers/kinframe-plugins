// The sandbox against the frame's own tests (QuickJsSandboxTest, PluginCtxTest): the bridge, the permission rules,
// render without network, the store limit, location, timeouts, imports.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PluginSandbox } from '../src/sandbox.mjs';
import { parseManifest } from '../src/manifest.mjs';
import { authorize, baseUrl, literalIsPrivate } from '../src/net.mjs';
import { PluginFormat } from '../src/format.mjs';

const MANIFEST = parseManifest(`{"id":"community.test","name":"Test","version":"1.0.0","api":1,"refresh":{"min_seconds":5,"default_seconds":10},
  "permissions":{"http":["settings.base_url"],"websocket":["settings.base_url"],"actions":true},
  "settings":[{"key":"base_url","type":"url","label":"URL","local_only":true},{"key":"n","type":"number","default":7}]}`);

function sandbox(main, { manifest = MANIFEST, settings = { base_url: 'http://192.168.1.20' }, fetch, ...env } = {}) {
  const requests = [];
  const sb = new PluginSandbox({ manifest, main, settings, env: { language: 'nl', ...env }, timeoutMs: 400,
    fetch: fetch || (async (r) => { requests.push(r); return { status: 200, body: { v: 1 } }; }) });
  sb.sent = requests;
  return sb;
}
const line = (r) => { assert.equal(r.error, null); return r.view.lines[0]; };

test('the bridge', async () => {
  const sb = sandbox(`export default { async render(ctx) {
    const lt = ctx.localTime(Date.UTC(2026, 9, 25, 23, 30));
    return { type: 'text', lines: [[ctx.settings.n, ctx.format.power(1234), ctx.format.number(2.345, 1, 'm/s'), ctx.t('hello {who}', { who: 'Jo' }),
      ctx.timezone, ctx.language, lt.date, lt.hour, lt.weekday, typeof __kf, typeof fetch, typeof require, typeof XMLHttpRequest].join('|')] };
  } }`);
  assert.equal(line(await sb.call('render')), '7|1,2 kW|2,3 m/s|hello Jo|Europe/Brussels|nl|2026-10-26|0|1|undefined|undefined|undefined|undefined');
});

test('http only to the address in the settings, and render/detail can\'t use the network', async () => {
  const sb = sandbox(`export default {
    async update(ctx) { ctx.state.v = (await ctx.http.get(ctx.settings.base_url + '/x')).json().v; },
    async render(ctx) { return { type: 'text', lines: ['v' + ctx.state.v] }; },
    async detail(ctx) { await ctx.http.get(ctx.settings.base_url + '/x'); return null; } }`);
  assert.equal((await sb.call('update')).error, null);
  assert.equal(line(await sb.call('render')), 'v1');
  assert.match((await sb.call('detail')).error, /detail can't use the network/);
  assert.equal(sb.sent.length, 1);
  const other = sandbox(`export default { async update(ctx) { await ctx.http.get('https://example.org/'); } }`);
  assert.match((await other.call('update')).error, /not allowed: https:\/\/example.org:443/);
});

test('local_only and plain http stay on the home network', () => {
  const opts = (base_url) => ({ manifest: MANIFEST, settings: { base_url } });
  assert.ok(authorize('http://192.168.1.20/api', opts('192.168.1.20')));
  assert.ok(authorize('http://[fd00::5]:8123/x', opts('http://[fd00::5]:8123')));
  assert.ok(authorize('http://homeassistant.local:8123/api', opts('homeassistant.local:8123')));
  assert.throws(() => authorize('http://8.8.8.8/x', opts('8.8.8.8')), /not on the home network/);
  assert.throws(() => authorize('http://127.0.0.1/x', opts('127.0.0.1')), /not on the home network/);
  assert.throws(() => authorize('https://ha.example.com/x', opts('https://ha.example.com')), /not on the home network/);
  assert.ok(authorize('https://ha.example.com/x', { ...opts('https://ha.example.com'), dns: { 'ha.example.com': '10.0.0.3' } }));
  assert.throws(() => authorize('http://192.168.1.20:81/x', opts('192.168.1.20')), /not allowed/);
  assert.throws(() => authorize('ftp://192.168.1.20/x', opts('192.168.1.20')), /not an http/);
  // A fixed origin on the internet, and a setting that isn't local_only, may be public (https).
  const fixed = parseManifest({ id: 'community.y', name: 'Y', version: '1.0.0', api: 1, permissions: { http: ['https://api.example.org', 'settings.cal'] }, settings: [{ key: 'cal', type: 'url' }] });
  assert.ok(authorize('https://api.example.org/v1?x=1', { manifest: fixed, settings: {} }));
  assert.ok(authorize('https://calendar.example.net/a.ics', { manifest: fixed, settings: { cal: 'https://calendar.example.net/a.ics' } }));
  assert.throws(() => authorize('http://calendar.example.net/a.ics', { manifest: fixed, settings: { cal: 'http://calendar.example.net/a.ics' } }), /home network/);
  assert.equal(literalIsPrivate('::ffff:192.168.0.1'), true);
  assert.equal(literalIsPrivate('fe80::1'), true);
  assert.equal(literalIsPrivate('100.64.0.1'), false);
  assert.equal(literalIsPrivate('example.org'), null);
  assert.equal(baseUrl('ftp://x'), null);
  assert.equal(baseUrl('p1meter.local:80/').port, 80);
});

test('the store is limited to 64 KB', async () => {
  const sb = sandbox(`export default { async render(ctx) { ctx.store.set('a', 'x'.repeat(60000)); ctx.store.set('big', 'x'.repeat(10000)); return null; } }`);
  assert.match((await sb.call('render')).error, /store full/);
  assert.equal(sb.store.get('a').length, 60000);
});

test('location only with the permission, coarse and frozen', async () => {
  const show = `export default { render(ctx) { 'use strict'; const l = ctx.location; let msg = 'kept'; try { if (l) l.latitude = 0; } catch (e) { msg = 'frozen'; } return { type: 'text', lines: [l ? msg + ' ' + l.latitude + ',' + l.longitude : 'none'] }; } }`;
  const withPerm = parseManifest({ ...MANIFEST.raw, permissions: { ...MANIFEST.raw.permissions, location: true } });
  assert.equal(line(await sandbox(show, { manifest: withPerm, location: { latitude: 50.912345, longitude: 4.104987 } }).call('render')), 'frozen 50.91,4.1');
  assert.equal(line(await sandbox(show, { location: { latitude: 50.9, longitude: 4.1 } }).call('render')), 'none');
  assert.equal(line(await sandbox(show, { manifest: withPerm }).call('render')), 'none');
});

test('relative dates in the frame\'s words', async () => {
  const js = `export default { render(ctx) { const n = ctx.now();
    return { type: 'text', lines: [ctx.format.day(n + 86400000) + '|' + ctx.format.ago(n - 480000) + '|' + ctx.format.until(n + 300000)] }; } }`;
  const now = Date.parse('2026-10-27T10:00:00Z');
  assert.equal(line(await sandbox(js, { now }).call('render')), 'Morgen|8 min geleden|over 5 min');
  assert.equal(line(await sandbox(js, { now, language: 'fr' }).call('render')), 'Demain|il y a 8 min|dans 5 min');
});

test('an endless loop is interrupted, also after an await, and the instance keeps working', async () => {
  const sb = sandbox(`let n = 0; export default {
    async update(ctx) { await ctx.http.get(ctx.settings.base_url + '/x'); for (;;) {} },
    render(ctx) { if (n++ === 0) for (;;) {} return { type: 'text', lines: ['ok'] }; } }`);
  assert.match((await sb.call('render')).error, /took longer than 400 ms/);
  assert.equal(line(await sb.call('render')), 'ok');
  assert.match((await sb.call('update')).error, /took longer than 400 ms/);
});

test('a plugin imports the host\'s libraries and nothing else; a library has the plugin\'s permissions', async () => {
  const bad = sandbox(`import x from './util'; export default { render() { return null; } }`);
  assert.match((await bad.call('render')).error, /import '\.\/util': a plugin can only import the host's libraries \(kinframe\/day, kinframe\/ha, kinframe\/homewizard, kinframe\/series\)/);
  const lib = sandbox(`import { data } from 'kinframe/homewizard'; export default {
    async update(ctx) { await data({ settings: { host: 'https://example.org' }, http: ctx.http }); },
    render() { return { type: 'text', lines: [typeof __kf] }; } }`);
  assert.match((await lib.call('update')).error, /not allowed/);
  assert.equal(line(await lib.call('render')), 'undefined');
});

test('a throw is a failure with the message; actions need the permission', async () => {
  const sb = sandbox(`export default { render() { throw new Error('boom'); }, action(ctx, id) { return { type: 'text', lines: ['did ' + id] }; } }`);
  assert.equal((await sb.call('render')).error, 'render: boom');
  assert.equal(line(await sb.call('action', 'next')), 'did next');
  const noPerm = sandbox(`export default { render() { return null; }, action() { return null; } }`, { manifest: parseManifest({ ...MANIFEST.raw, permissions: { http: ['settings.base_url'] } }) });
  await noPerm.call('render');
  assert.match((await noPerm.call('action', 'x')).error, /no actions permission/);
});

test('WebSocket messages reach the handlers; a refused socket is logged', async () => {
  const sb = sandbox(`export default { start(ctx) { ctx.ws.connect('ws://192.168.1.20/api/websocket', {
      onOpen: (ws) => ws.send({ type: 'auth' }), onMessage: (ws, m) => { ctx.state.v = m.v; ctx.invalidate(); } }); return null; },
    render(ctx) { return { type: 'text', lines: ['v' + ctx.state.v] }; } }`);
  await sb.call('start');
  assert.equal((await sb.wsEvent('open')).error, null);
  assert.deepEqual(sb.wsSent, ['{"type":"auth"}']);
  await sb.wsEvent('message', { v: 7 });
  assert.equal(line(await sb.call('render')), 'v7');
  assert.equal(sb.invalidations, 1);
  const refused = sandbox(`export default { start(ctx) { ctx.ws.connect('wss://evil.example/x', {}); return null; } }`);
  await refused.call('start');
  assert.match(refused.logs.join('\n'), /ws: not allowed/);
});

test('ctx.format like PluginFormat', () => {
  const nl = new PluginFormat({ language: 'nl', zone: 'Europe/Brussels' });
  const N = ' ';
  assert.equal(nl.power(850), `850${N}W`);
  assert.equal(nl.power(1234), `1,2${N}kW`);
  assert.equal(nl.power(12345), `12${N}kW`);
  assert.equal(nl.power(-0.2), `0${N}W`);
  assert.equal(nl.energy(0.45), `450${N}Wh`);
  assert.equal(nl.energy(3.454), `3,45${N}kWh`);
  assert.equal(nl.energy(1234), `1.234${N}kWh`);
  assert.equal(nl.volume(1.234), `1,23${N}m³`);
  assert.equal(nl.temperature(12.84, 1), '12,8°');
  assert.equal(new PluginFormat({ language: 'en', temperatureUnit: 'f' }).temperature(20), '68°');
  assert.equal(nl.duration(8100), `2${N}h 15${N}min`);
  assert.equal(nl.percent(68), '68%');
  const t = Date.parse('2026-10-25T21:20:00Z');
  assert.equal(nl.time(t), '22:20');
  assert.equal(nl.time(t, 'Asia/Tokyo'), '06:20');
  assert.equal(new PluginFormat({ language: 'en', h24: false }).time(t), '10:20 PM');
  assert.equal(nl.day(t + 3 * 86400000, t), 'Woensdag');
  assert.throws(() => nl.time(t, 'Mars/Olympus'), /unknown time zone/);
});
