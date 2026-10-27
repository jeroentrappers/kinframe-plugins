// Finding and reading plugins in the repository's plugins/ folder.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import { PLUGINS_DIR } from './paths.mjs';
import { parseManifest } from './manifest.mjs';
import { readLocales } from './sandbox.mjs';

/** Plugin folders for the ids given (an id, or a path to a plugin folder), or all of plugins/. */
export function pluginDirs(args = [], root = PLUGINS_DIR) {
  if (args.length) {
    return args.map((a) => {
      const asPath = resolve(a);
      if (existsSync(join(asPath, 'plugin.json'))) return asPath;
      const inRepo = join(root, a);
      if (existsSync(inRepo)) return inRepo;
      throw new Error(`no plugin ${a} (looked in ${root})`);
    });
  }
  if (!existsSync(root)) return [];
  return readdirSync(root).filter((d) => statSync(join(root, d)).isDirectory()).sort().map((d) => join(root, d));
}

/** Reads a plugin folder; `manifest` is null and `manifestError` set when plugin.json doesn't pass the frame's rules. */
export function readPlugin(dir) {
  const p = { dir, folder: basename(dir), manifest: null, manifestError: null, raw: null, main: null, locales: {} };
  const mf = join(dir, 'plugin.json');
  if (!existsSync(mf)) { p.manifestError = 'no plugin.json'; return p; }
  const text = readFileSync(mf, 'utf8');
  try { p.raw = JSON.parse(text); } catch (e) { p.manifestError = `plugin.json is not valid JSON: ${e.message}`; }
  if (p.raw) {
    try { p.manifest = parseManifest(p.raw); } catch (e) { p.manifestError = e.message; }
  }
  const mj = join(dir, 'main.js');
  if (existsSync(mj)) p.main = readFileSync(mj, 'utf8');
  try { p.locales = readLocales(dir); } catch (e) { p.localeError = e.message; }
  return p;
}
