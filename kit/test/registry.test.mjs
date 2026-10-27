// Bundles, the index and its signature (§7.1).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { generateKeyPairSync } from 'node:crypto';
import { buildBundle, nextIndex, indexText, signBytes, verifyBytes, privateKey, publicKey, generateKeys, compareVersions, RegistryError } from '../src/registry.mjs';
import { bundleFiles, zipFiles, unzip } from '../src/bundle.mjs';
import { pluginDirs } from '../src/plugins.mjs';
import { REPO_DIR } from '../src/paths.mjs';

test('bundles are deterministic and hold only plugin.json, main.js and locales', async () => {
  for (const dir of pluginDirs()) {
    const a = buildBundle(dir), b = buildBundle(dir);
    assert.equal(a.sha256, b.sha256);
    assert.ok(a.zip.equals(b.zip));
    const entries = await unzip(a.zip);
    const names = entries.map((e) => e.name);
    assert.deepEqual(names, [...names].sort());
    assert.ok(names.includes('plugin.json') && names.includes('main.js'));
    assert.ok(names.every((n) => n === 'plugin.json' || n === 'main.js' || /^locales\/[A-Za-z0-9-]+\.json$/.test(n)));
    for (const e of entries) assert.ok(e.data.equals(readFileSync(join(dir, e.name))));
    assert.equal(a.zip.readUInt16LE(10), 0); // DOS time 00:00
    assert.equal(a.zip.readUInt16LE(12), 33); // 1980-01-01
    assert.equal(a.file, `${a.id}-${a.version}.zip`);
    assert.ok(Object.keys(a.locales.nl).every((k) => k.startsWith('@')));
  }
});

test('the same files in another order give the same zip', () => {
  const dir = pluginDirs()[0];
  const f = bundleFiles(dir);
  assert.ok(zipFiles(f).equals(zipFiles(bundleFiles(dir))));
});

const b = (id, version, sha = 'a'.repeat(64)) => ({ id, version, api: 1, file: `${id}-${version}.zip`, size: 10, sha256: sha, manifest: { id, version }, locales: {} });
const T1 = Date.parse('2026-10-27T12:00:00Z'), T2 = Date.parse('2026-10-28T08:30:00.500Z');

test('the first index, then one more version: sequence, kept versions, publication order', () => {
  const first = nextIndex(null, [b('community.b', '1.0.0'), b('community.a', '1.0.0')], [], { now: T1 });
  assert.equal(first.index.sequence, 1);
  assert.equal(first.index.generated_at, '2026-10-27T12:00:00Z');
  assert.deepEqual(first.index.plugins.map((p) => p.id), ['community.a', 'community.b']);
  assert.equal(first.added.length, 2);
  const prev = JSON.parse(indexText(first.index));
  const second = nextIndex(prev, [b('community.a', '1.1.0', 'b'.repeat(64)), b('community.b', '1.0.0')], [], { now: T2 });
  assert.equal(second.index.sequence, 2);
  assert.equal(second.index.generated_at, '2026-10-28T08:30:00Z');
  const a = second.index.plugins.find((p) => p.id === 'community.a');
  assert.deepEqual(a.versions.map((v) => [v.version, v.published_at]), [['1.0.0', '2026-10-27T12:00:00Z'], ['1.1.0', '2026-10-28T08:30:00Z']]);
  assert.deepEqual(second.added.map((x) => x.file), ['community.a-1.1.0.zip']);
  // A plugin removed from the repository stays published.
  const third = nextIndex(second.index, [], [], { now: T2 });
  assert.equal(third.changed, false);
  assert.equal(third.index.plugins.length, 2);
});

test('refusals: a changed bundle for a published version, a lower version', () => {
  const prev = nextIndex(null, [b('community.a', '1.1.0')], [], { now: T1 }).index;
  assert.throws(() => nextIndex(prev, [b('community.a', '1.1.0', 'c'.repeat(64))], [], { now: T2 }), /already published with a different bundle/);
  assert.throws(() => nextIndex(prev, [b('community.a', '1.0.9')], [], { now: T2 }), /not higher than the published 1.1.0/);
  assert.throws(() => nextIndex({ format: 2, sequence: 1, plugins: [] }, [], []), RegistryError);
});

test('revocations are carried over and can\'t be undone', () => {
  const prev = nextIndex(null, [b('community.a', '1.0.0')], [], { now: T1 }).index;
  const r = [{ id: 'community.a', version: '1.0.0', reason: 'sent the token to the wrong host' }];
  const next = nextIndex(prev, [], r, { now: T2 });
  assert.ok(next.changed);
  assert.deepEqual(next.index.revoked, r);
  assert.equal(nextIndex(next.index, [], r, { now: T2 }).changed, false);
  assert.throws(() => nextIndex(next.index, [], [], { now: T2 }), /can't be undone/);
  assert.throws(() => nextIndex(prev, [], [{ id: 'community.a', version: '9.9.9', reason: 'x' }]), /never published/);
});

test('semver order', () => {
  const v = ['1.0.0', '1.0.0-alpha', '1.0.0-alpha.1', '1.0.0-beta', '1.0.0-beta.2', '1.0.0-beta.11', '1.0.0-rc.1', '0.9.9', '1.10.0', '1.2.0'];
  assert.deepEqual([...v].sort(compareVersions), ['0.9.9', '1.0.0-alpha', '1.0.0-alpha.1', '1.0.0-beta', '1.0.0-beta.2', '1.0.0-beta.11', '1.0.0-rc.1', '1.0.0', '1.2.0', '1.10.0']);
});

test('sign and verify round trip with a throwaway key; a changed byte fails', () => {
  const { privatePem, publicBase64 } = generateKeys();
  const bytes = Buffer.from(indexText(nextIndex(null, [b('community.a', '1.0.0')], [], { now: T1 }).index));
  const sig = signBytes(bytes, privateKey(privatePem));
  assert.ok(!sig.includes('\n'));
  const der = Buffer.from(sig, 'base64');
  assert.equal(der[0], 0x30); // a DER SEQUENCE (r, s)
  assert.ok(verifyBytes(bytes, sig, publicKey(publicBase64)));
  const changed = Buffer.from(bytes); changed[changed.length - 2] ^= 1;
  assert.ok(!verifyBytes(changed, sig, publicKey(publicBase64)));
  // The registry's real key parses as P-256; a throwaway signature doesn't verify against it.
  const real = publicKey(readFileSync(join(REPO_DIR, 'registry', 'public-key.b64'), 'utf8'));
  assert.ok(!verifyBytes(bytes, sig, real));
  const rsa = generateKeyPairSync('rsa', { modulusLength: 1024 }).privateKey.export({ type: 'pkcs8', format: 'pem' });
  assert.throws(() => privateKey(rsa), /P-256/);
});

test('the CLI: build, index, sign, verify', async () => {
  const { execFileSync } = await import('node:child_process');
  const out = mkdtempSync(join(tmpdir(), 'kit-dist-'));
  const kit = (...a) => execFileSync(process.execPath, [join(REPO_DIR, 'kit', 'bin', 'kit.mjs'), ...a], { cwd: REPO_DIR, encoding: 'utf8', env: { ...process.env, SOURCE_DATE_EPOCH: '1793102400' } });
  try {
    kit('build', '--out', out);
    kit('index', '--previous', 'none', '--out', out);
    const ix = JSON.parse(readFileSync(join(out, 'index.json'), 'utf8'));
    assert.equal(ix.sequence, 1);
    assert.equal(ix.generated_at, '2026-10-27T12:00:00Z');
    assert.equal(readFileSync(join(out, 'publish.txt'), 'utf8').trim().split('\n').length, pluginDirs().length);
    kit('keygen', '--out', join(out, 'keys'));
    kit('sign', '--key', join(out, 'keys', 'registry-private.pem'), join(out, 'index.json'));
    assert.match(kit('verify', '--key', join(out, 'keys', 'public-key.b64'), join(out, 'index.json')), /signature valid/);
    // Again on the published index: nothing new.
    const prev = join(out, 'prev.json');
    writeFileSync(prev, readFileSync(join(out, 'index.json')));
    assert.match(kit('index', '--previous', prev, '--out', out), /nothing new to publish/);
  } finally { rmSync(out, { recursive: true, force: true }); }
});
