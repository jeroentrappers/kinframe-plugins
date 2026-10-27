// Bundles (§7.1): `<id>-<version>.zip` with plugin.json, main.js and locales/<tag>.json, nothing else; at most 512 KB,
// unpacked at most 1 MB. Deterministic: entries sorted by name, stored (not compressed), fixed timestamps
// (1980-01-01 00:00), no extra fields, so the same files always give the same bytes and sha256 on any machine and
// Node version (compression output may change between zlib versions; plugins are a few KB, so storing costs nothing).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { crc32 } from 'node:zlib';
import { createHash } from 'node:crypto';

export const BUNDLE_LIMITS = { zipBytes: 512 * 1024, unpackedBytes: 1024 * 1024 };

/** The files that go into a plugin's bundle, sorted by name. */
export function bundleFiles(dir) {
  const files = [
    { name: 'plugin.json', data: readFileSync(join(dir, 'plugin.json')) },
    { name: 'main.js', data: readFileSync(join(dir, 'main.js')) },
  ];
  const ld = join(dir, 'locales');
  if (existsSync(ld)) {
    for (const f of readdirSync(ld)) {
      if (!/^[A-Za-z0-9-]+\.json$/.test(f)) throw new Error(`locales/${f}: only <tag>.json files go into a bundle`);
      files.push({ name: `locales/${f}`, data: readFileSync(join(ld, f)) });
    }
  }
  return files.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

// DOS date/time for 1980-01-01 00:00:00.
const DOS_TIME = 0;
const DOS_DATE = (0 << 9) | (1 << 5) | 1;

/** A zip archive of `files` ([{ name, data }]), stored, deterministic. */
export function zipFiles(files) {
  const locals = [], centrals = [];
  let offset = 0;
  for (const f of files) {
    const name = Buffer.from(f.name, 'utf8');
    const data = Buffer.isBuffer(f.data) ? f.data : Buffer.from(f.data);
    const crc = crc32(data) >>> 0;
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4); // version needed
    lh.writeUInt16LE(0x0800, 6); // UTF-8 names
    lh.writeUInt16LE(0, 8); // stored
    lh.writeUInt16LE(DOS_TIME, 10);
    lh.writeUInt16LE(DOS_DATE, 12);
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(data.length, 18);
    lh.writeUInt32LE(data.length, 22);
    lh.writeUInt16LE(name.length, 26);
    lh.writeUInt16LE(0, 28);
    locals.push(lh, name, data);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(20, 4); // made by (MS-DOS, 2.0): no Unix modes, so nothing executable or a symlink
    ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(0x0800, 8);
    ch.writeUInt16LE(0, 10);
    ch.writeUInt16LE(DOS_TIME, 12);
    ch.writeUInt16LE(DOS_DATE, 14);
    ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(data.length, 20);
    ch.writeUInt32LE(data.length, 24);
    ch.writeUInt16LE(name.length, 28);
    ch.writeUInt16LE(0, 30); // extra
    ch.writeUInt16LE(0, 32); // comment
    ch.writeUInt16LE(0, 34); // disk
    ch.writeUInt16LE(0, 36); // internal attributes
    ch.writeUInt32LE(0, 38); // external attributes
    ch.writeUInt32LE(offset, 42);
    centrals.push(ch, name);
    offset += lh.length + name.length + data.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

/** Reads a stored or deflated zip back into [{ name, data }] (for tests and `kit verify --bundles`). */
export async function unzip(buf) {
  const { inflateRawSync } = await import('node:zlib');
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) throw new Error('not a zip file');
  const n = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out = [];
  for (let i = 0; i < n; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('bad central directory');
    const method = buf.readUInt16LE(p + 10);
    const csize = buf.readUInt32LE(p + 20);
    const nlen = buf.readUInt16LE(p + 28), xlen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nlen);
    const lstart = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const raw = buf.subarray(lstart, lstart + csize);
    out.push({ name, data: method === 0 ? Buffer.from(raw) : inflateRawSync(raw) });
    p += 46 + nlen + xlen + clen;
  }
  return out;
}

export const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

/** The `@` keys of each locale (for the index: the apps' forms need only those). */
export function manifestLocales(files) {
  const out = {};
  for (const f of files) {
    const m = /^locales\/(.+)\.json$/.exec(f.name);
    if (!m) continue;
    const o = JSON.parse(f.data.toString('utf8'));
    const at = Object.fromEntries(Object.entries(o).filter(([k, v]) => k.startsWith('@') && typeof v === 'string'));
    if (Object.keys(at).length) out[m[1]] = at;
  }
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => (a < b ? -1 : 1)));
}
