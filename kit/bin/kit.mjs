#!/usr/bin/env node
// The kinframe plugin kit. Run from the repository root: `npm run kit -- <command>` or `node kit/bin/kit.mjs <command>`.
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';
import { pluginDirs, readPlugin } from '../src/plugins.mjs';
import { checkPlugin } from '../src/check.mjs';
import { scenarioFiles, testScenario } from '../src/scenario.mjs';
import { buildBundle, writeBuild, nextIndex, readRevoked, indexText, privateKey, publicKey, signBytes, verifyBytes, generateKeys, RegistryError, checkIndex } from '../src/registry.mjs';

const HELP = `kinframe plugin kit

  kit new <id>                      scaffold plugins/<id> (manifest, main.js, locales, a scenario, README)
  kit check [id…]                   manifest rules, translations, forbidden code, sizes, secrets in fixtures
  kit test [id…] [--update]         run each scenario in the QuickJS sandbox, compare with its snapshot
                 [--timeout <ms>]   (--update writes the snapshots; review the diff)
  kit preview [id] [--port 8770]    a local page that draws the scenarios' views in the frame's forms
  kit build [id…] [--out dist]      bundles <id>-<version>.zip (+ bundles.json) as published (§7.1)
  kit index --previous <index.json|none> [--out dist] [--force]
                                    the next index.json from the previous one and the built bundles
  kit sign [--key <pem file>] dist/index.json      writes index.json.sig (key also from REGISTRY_PRIVATE_KEY)
  kit verify --key <base64 SPKI | file> dist/index.json
  kit keygen [--out dir]            a throwaway P-256 key pair, for tests and local trials
  kit types [--out dir]             set up type checking (jsconfig.json); --out copies the .d.ts files

An <id> is a folder in plugins/ (or a path to a plugin folder). Without ids: every plugin.`;

function parseArgs(argv) {
  const pos = [], opt = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=');
      if (v !== undefined) opt[k] = v;
      else if (i + 1 < argv.length && !argv[i + 1].startsWith('--') && !['update', 'force', 'no-open'].includes(k)) opt[k] = argv[++i];
      else opt[k] = true;
    } else pos.push(a);
  }
  return { pos, opt };
}

const tty = process.stdout.isTTY && !process.env.NO_COLOR;
const color = (c, s) => (tty ? `\x1b[${c}m${s}\x1b[0m` : s);
const red = (s) => color(31, s), green = (s) => color(32, s), yellow = (s) => color(33, s), dim = (s) => color(2, s);
const indent = (s, n = 4) => s.split('\n').map((l) => ' '.repeat(n) + l).join('\n');

async function cmdCheck(ids) {
  let failed = 0;
  for (const dir of pluginDirs(ids)) {
    const r = checkPlugin(readPlugin(dir));
    if (r.errors.length) { failed++; console.log(`${red('✗')} ${r.id}`); r.errors.forEach((e) => console.log(indent(red(e)))); }
    else console.log(`${green('✓')} ${r.id}`);
    r.warnings.forEach((w) => console.log(indent(yellow('warning: ') + w)));
  }
  return failed ? 1 : 0;
}

async function cmdTest(ids, opt) {
  let failed = 0, ran = 0;
  for (const dir of pluginDirs(ids)) {
    const plugin = readPlugin(dir);
    const files = scenarioFiles(dir);
    if (!files.length) { console.log(`${yellow('–')} ${plugin.folder}: no scenarios`); continue; }
    for (const f of files) {
      ran++;
      const r = await testScenario(plugin, f, { update: !!opt.update, timeoutMs: opt.timeout ? Number(opt.timeout) : undefined });
      const label = `${plugin.folder}/${r.name}`;
      if (r.errors.length) { failed++; console.log(`${red('✗')} ${label}`); r.errors.forEach((e) => console.log(indent(red(e)))); }
      else console.log(`${green('✓')} ${label}${r.updated ? dim(' (snapshot written)') : ''}`);
      r.warnings.forEach((w) => console.log(indent(yellow('warning: ') + w)));
    }
  }
  console.log(`${ran - failed}/${ran} scenarios passed`);
  return failed ? 1 : 0;
}

async function cmdBuild(ids, opt) {
  const out = resolve(opt.out || 'dist');
  const bundles = [];
  let failed = false;
  for (const dir of pluginDirs(ids)) {
    const plugin = readPlugin(dir);
    const c = checkPlugin(plugin);
    if (c.errors.length) { failed = true; console.log(`${red('✗')} ${c.id}: doesn't pass kit check`); c.errors.forEach((e) => console.log(indent(red(e)))); continue; }
    const b = buildBundle(dir);
    bundles.push(b);
    console.log(`${green('✓')} ${b.file}  ${b.size} bytes  sha256 ${b.sha256}`);
  }
  if (failed) return 1;
  writeBuild(bundles, out);
  console.log(dim(`wrote ${bundles.length} bundle(s) and bundles.json to ${relative(process.cwd(), out) || '.'}`));
  return 0;
}

async function cmdIndex(opt) {
  const out = resolve(opt.out || 'dist');
  if (!opt.previous) { console.error('kit index: --previous <index.json|none> is required'); return 2; }
  const meta = join(out, 'bundles.json');
  if (!existsSync(meta)) { console.error(`kit index: no ${relative(process.cwd(), meta)}; run kit build --out ${relative(process.cwd(), out) || '.'} first`); return 2; }
  // Never leave an older index.json behind for a workflow to upload.
  for (const f of ['index.json', 'index.json.sig', 'publish.txt']) rmSync(join(out, f), { force: true });
  const built = JSON.parse(readFileSync(meta, 'utf8'));
  const previous = opt.previous === 'none' ? null : JSON.parse(readFileSync(resolve(opt.previous), 'utf8'));
  const now = process.env.SOURCE_DATE_EPOCH ? Number(process.env.SOURCE_DATE_EPOCH) * 1000 : opt.now ? Date.parse(opt.now) : Date.now();
  try {
    const { index, added, changed } = nextIndex(previous, built, readRevoked(opt.revoked ? resolve(opt.revoked) : undefined), { now });
    const publish = join(out, 'publish.txt');
    if (!changed && !opt.force) {
      writeFileSync(publish, '');
      console.log(`nothing new to publish (sequence stays ${index.sequence - 1}); no index.json written`);
      return 0;
    }
    writeFileSync(join(out, 'index.json'), indexText(index));
    writeFileSync(publish, added.map((b) => b.file).join('\n') + (added.length ? '\n' : ''));
    added.forEach((b) => console.log(`${green('+')} ${b.id} ${b.version}`));
    console.log(`index.json sequence ${index.sequence}: ${index.plugins.length} plugin(s), ${added.length} new version(s), ${index.revoked.length} revoked`);
    return 0;
  } catch (e) {
    if (e instanceof RegistryError) { console.error(red(e.message)); return 1; }
    throw e;
  }
}

async function cmdSign(pos, opt) {
  const file = pos[0];
  if (!file) { console.error('kit sign: name the index.json to sign'); return 2; }
  let pem = null;
  if (opt.key && opt.key !== true) pem = readFileSync(resolve(opt.key), 'utf8');
  else if (process.env.REGISTRY_PRIVATE_KEY) pem = process.env.REGISTRY_PRIVATE_KEY;
  if (!pem) { console.error('kit sign: --key <pem file> or REGISTRY_PRIVATE_KEY'); return 2; }
  const bytes = readFileSync(resolve(file));
  writeFileSync(resolve(file) + '.sig', signBytes(bytes, privateKey(pem)));
  console.log(`signed ${file} → ${file}.sig`);
  return 0;
}

async function cmdVerify(pos, opt) {
  const file = pos[0];
  if (!file || !opt.key || opt.key === true) { console.error('kit verify --key <base64 SPKI | file> <index.json>'); return 2; }
  const keyText = existsSync(resolve(opt.key)) ? readFileSync(resolve(opt.key), 'utf8') : opt.key;
  const bytes = readFileSync(resolve(file));
  const sigFile = opt.sig ? resolve(opt.sig) : resolve(file) + '.sig';
  if (!existsSync(sigFile)) { console.error(red(`no signature ${relative(process.cwd(), sigFile)}`)); return 1; }
  if (!verifyBytes(bytes, readFileSync(sigFile, 'utf8'), publicKey(keyText))) { console.error(red(`${file}: signature does NOT match`)); return 1; }
  const ix = checkIndex(JSON.parse(bytes.toString('utf8')));
  console.log(`${green('✓')} ${file}: signature valid (sequence ${ix.sequence}, ${ix.plugins.length} plugin(s))`);
  return 0;
}

async function cmdKeygen(opt) {
  const { privatePem, publicBase64 } = generateKeys();
  if (opt.out && opt.out !== true) {
    const out = resolve(opt.out);
    mkdirSync(out, { recursive: true });
    writeFileSync(join(out, 'registry-private.pem'), privatePem, { mode: 0o600 });
    writeFileSync(join(out, 'public-key.b64'), publicBase64 + '\n');
    console.log(`wrote ${join(out, 'registry-private.pem')} and ${join(out, 'public-key.b64')} (throwaway: never commit a private key)`);
  } else {
    process.stdout.write(privatePem + publicBase64 + '\n');
  }
  return 0;
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const { pos, opt } = parseArgs(rest);
  switch (cmd) {
    case 'check': return cmdCheck(pos);
    case 'test': return cmdTest(pos, opt);
    case 'build': return cmdBuild(pos, opt);
    case 'index': return cmdIndex(opt);
    case 'sign': return cmdSign(pos, opt);
    case 'verify': return cmdVerify(pos, opt);
    case 'keygen': return cmdKeygen(opt);
    case 'new': return (await import('../src/new.mjs')).cmdNew(pos, opt);
    case 'preview': return (await import('../src/preview.mjs')).cmdPreview(pos, opt);
    case 'types': return (await import('../src/types.mjs')).cmdTypes(opt);
    case undefined: case 'help': case '--help': case '-h': console.log(HELP); return 0;
    default: console.error(`unknown command ${cmd}\n\n${HELP}`); return 2;
  }
}

main().then((code) => { process.exitCode = code; }, (e) => { console.error(red(e.stack || e.message)); process.exitCode = 1; });
