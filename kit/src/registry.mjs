// Publishing (§7, §7.1): bundles, the index and its signature.
//
//   kit build [id…] --out dist        → dist/<id>-<version>.zip and dist/bundles.json (what was built)
//   kit index --previous <index.json|none> --out dist
//                                     → dist/index.json (sequence + 1, every published version kept, new versions
//                                       added, revocations from registry/revoked.json) and dist/publish.txt (the
//                                       bundles to upload); refuses a changed bundle for a published version
//   kit sign --key <pem> dist/index.json  → dist/index.json.sig: base64 of the DER ECDSA P-256/SHA-256 signature
//   kit verify --key <base64 SPKI | file> dist/index.json
import { createPrivateKey, createPublicKey, sign as cryptoSign, verify as cryptoVerify, generateKeyPairSync } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { bundleFiles, zipFiles, sha256, manifestLocales, BUNDLE_LIMITS } from './bundle.mjs';
import { REPO_DIR } from './paths.mjs';

export const INDEX_FORMAT = 1;

/** Compares two semver versions (§ semver.org precedence). */
export function compareVersions(a, b) {
  const parse = (v) => { const [core, pre] = v.split(/-(.*)/s); return { nums: core.split('.').map(Number), pre: pre ? pre.split('.') : [] }; };
  const x = parse(a), y = parse(b);
  for (let i = 0; i < 3; i++) if (x.nums[i] !== y.nums[i]) return x.nums[i] - y.nums[i];
  if (!x.pre.length || !y.pre.length) return y.pre.length - x.pre.length;
  for (let i = 0; i < Math.max(x.pre.length, y.pre.length); i++) {
    if (x.pre[i] === undefined) return -1;
    if (y.pre[i] === undefined) return 1;
    const nx = /^\d+$/.test(x.pre[i]), ny = /^\d+$/.test(y.pre[i]);
    if (nx && ny && +x.pre[i] !== +y.pre[i]) return +x.pre[i] - +y.pre[i];
    if (nx !== ny) return nx ? -1 : 1;
    if (x.pre[i] !== y.pre[i]) return x.pre[i] < y.pre[i] ? -1 : 1;
  }
  return 0;
}

/** Builds one plugin's bundle. Returns { id, version, file, size, sha256, zip, manifest, locales, unpacked }. */
export function buildBundle(dir) {
  const files = bundleFiles(dir);
  const zip = zipFiles(files);
  const manifest = JSON.parse(files.find((f) => f.name === 'plugin.json').data.toString('utf8'));
  const unpacked = files.reduce((a, f) => a + f.data.length, 0);
  if (zip.length > BUNDLE_LIMITS.zipBytes) throw new Error(`${manifest.id}: bundle is ${zip.length} bytes (at most ${BUNDLE_LIMITS.zipBytes})`);
  if (unpacked > BUNDLE_LIMITS.unpackedBytes) throw new Error(`${manifest.id}: bundle unpacks to ${unpacked} bytes (at most ${BUNDLE_LIMITS.unpackedBytes})`);
  return {
    id: manifest.id, version: manifest.version, api: manifest.api, file: `${manifest.id}-${manifest.version}.zip`,
    size: zip.length, sha256: sha256(zip), zip, manifest, locales: manifestLocales(files), unpacked,
  };
}

/** Writes bundles to `out` plus out/bundles.json describing them (without the bytes). */
export function writeBuild(bundles, out) {
  mkdirSync(out, { recursive: true });
  for (const b of bundles) writeFileSync(join(out, b.file), b.zip);
  const meta = bundles.map(({ zip, unpacked, ...rest }) => rest);
  writeFileSync(join(out, 'bundles.json'), JSON.stringify(meta, null, 2) + '\n');
}

const isoSeconds = (ms) => new Date(Math.floor(ms / 1000) * 1000).toISOString().replace('.000Z', 'Z');

export class RegistryError extends Error {}

/** Checks an index's shape (a previous one, before building on it). */
export function checkIndex(ix) {
  const bad = (m) => { throw new RegistryError(`previous index: ${m}`); };
  if (!ix || typeof ix !== 'object') bad('not an object');
  if (ix.format !== INDEX_FORMAT) bad(`format ${ix.format}, expected ${INDEX_FORMAT}`);
  if (!Number.isInteger(ix.sequence) || ix.sequence < 1) bad('sequence must be a positive integer');
  if (!Array.isArray(ix.plugins)) bad('plugins must be an array');
  for (const p of ix.plugins) {
    if (typeof p.id !== 'string' || !Array.isArray(p.versions)) bad('each plugin needs id and versions');
    for (const v of p.versions) if (!/^[0-9a-f]{64}$/.test(v.sha256 || '') || typeof v.file !== 'string') bad(`${p.id} ${v.version}: needs file and sha256`);
  }
  if (ix.revoked !== undefined && !Array.isArray(ix.revoked)) bad('revoked must be an array');
  return ix;
}

/** registry/revoked.json: [{ id, version, reason }]. */
export function readRevoked(file = join(REPO_DIR, 'registry', 'revoked.json')) {
  if (!existsSync(file)) return [];
  const r = JSON.parse(readFileSync(file, 'utf8'));
  if (!Array.isArray(r)) throw new RegistryError('registry/revoked.json must be an array of { id, version, reason }');
  r.forEach((x, i) => {
    if (!x || typeof x.id !== 'string' || typeof x.version !== 'string' || typeof x.reason !== 'string' || !x.reason.trim()) {
      throw new RegistryError(`registry/revoked.json[${i}]: needs id, version and a reason`);
    }
    const extra = Object.keys(x).filter((k) => !['id', 'version', 'reason'].includes(k));
    if (extra.length) throw new RegistryError(`registry/revoked.json[${i}]: unknown ${extra.join(', ')}`);
  });
  return r;
}

/**
 * The next index from the previous one (null for the first), what was just built and the revocations.
 * Returns { index, added: [bundle], changed: boolean }. Throws RegistryError on a refusal.
 */
export function nextIndex(previous, built, revoked, { now = Date.now() } = {}) {
  const prev = previous ? checkIndex(structuredClone(previous)) : { format: INDEX_FORMAT, sequence: 0, plugins: [], revoked: [] };
  const at = isoSeconds(now);
  const errors = [];
  const plugins = new Map(prev.plugins.map((p) => [p.id, { id: p.id, versions: [...p.versions] }]));
  const added = [];
  for (const b of [...built].sort((x, y) => (x.id < y.id ? -1 : 1))) {
    const p = plugins.get(b.id) || { id: b.id, versions: [] };
    const same = p.versions.find((v) => v.version === b.version);
    if (same) {
      if (same.sha256 !== b.sha256) errors.push(`${b.id} ${b.version} is already published with a different bundle (sha256 ${same.sha256.slice(0, 12)}…, now ${b.sha256.slice(0, 12)}…): published bundles are never replaced, raise the version`);
      continue;
    }
    const newest = p.versions.map((v) => v.version).sort(compareVersions).pop();
    if (newest && compareVersions(b.version, newest) <= 0) {
      errors.push(`${b.id} ${b.version} is not higher than the published ${newest}: a new version needs a higher version`);
      continue;
    }
    if (built.some((o) => o !== b && o.file === b.file)) { errors.push(`${b.file} was built twice`); continue; }
    p.versions.push({ version: b.version, api: b.api, file: b.file, size: b.size, sha256: b.sha256, published_at: at, manifest: b.manifest, locales: b.locales });
    plugins.set(b.id, p);
    added.push(b);
  }

  const known = (id, version) => plugins.get(id)?.versions.some((v) => v.version === version);
  const rv = [];
  for (const r of revoked) {
    if (!known(r.id, r.version)) errors.push(`registry/revoked.json: ${r.id} ${r.version} was never published`);
    else if (rv.some((x) => x.id === r.id && x.version === r.version)) errors.push(`registry/revoked.json: ${r.id} ${r.version} is listed twice`);
    else rv.push({ id: r.id, version: r.version, reason: r.reason });
  }
  for (const r of prev.revoked || []) {
    if (!rv.some((x) => x.id === r.id && x.version === r.version)) errors.push(`${r.id} ${r.version} was revoked and is missing from registry/revoked.json: a revocation can't be undone (publish a new version instead)`);
  }
  if (errors.length) throw new RegistryError(errors.join('\n'));

  const changed = added.length > 0 || JSON.stringify(rv) !== JSON.stringify(prev.revoked || []);
  const index = {
    format: INDEX_FORMAT,
    sequence: prev.sequence + 1,
    generated_at: at,
    plugins: [...plugins.values()].sort((x, y) => (x.id < y.id ? -1 : 1)),
    revoked: rv,
  };
  return { index, added, changed };
}

export const indexText = (index) => JSON.stringify(index, null, 2) + '\n';

/** Reads a private key (PEM, PKCS#8 or SEC1) and checks it is P-256. */
export function privateKey(pem) {
  const key = createPrivateKey(pem);
  if (key.asymmetricKeyType !== 'ec' || key.asymmetricKeyDetails?.namedCurve !== 'prime256v1') throw new RegistryError('the registry key must be an ECDSA P-256 key');
  return key;
}

/** A public key from base64 SubjectPublicKeyInfo (DER), or a file holding it, or a PEM. */
export function publicKey(text) {
  const t = text.trim();
  if (t.startsWith('-----BEGIN')) return createPublicKey(t);
  const key = createPublicKey({ key: Buffer.from(t, 'base64'), format: 'der', type: 'spki' });
  if (key.asymmetricKeyType !== 'ec' || key.asymmetricKeyDetails?.namedCurve !== 'prime256v1') throw new RegistryError('the registry key must be an ECDSA P-256 key');
  return key;
}

/** base64 of the DER ECDSA P-256 SHA-256 signature over the exact bytes. */
export function signBytes(bytes, key) {
  return cryptoSign('sha256', bytes, { key, dsaEncoding: 'der' }).toString('base64');
}

export function verifyBytes(bytes, sigBase64, key) {
  return cryptoVerify('sha256', bytes, { key, dsaEncoding: 'der' }, Buffer.from(sigBase64.trim(), 'base64'));
}

/** A throwaway key pair: { privatePem (PKCS#8), publicBase64 (SPKI DER) }. */
export function generateKeys() {
  const { privateKey: k, publicKey: p } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  return { privatePem: k.export({ type: 'pkcs8', format: 'pem' }), publicBase64: p.export({ type: 'spki', format: 'der' }).toString('base64') };
}
