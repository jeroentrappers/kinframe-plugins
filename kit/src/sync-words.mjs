// Extracts the frame's words for ctx.format.day/ago/until (plugin_rel_* in strings_plugins.xml) per language, as
// JSON: { "": {...English...}, "nl": {...}, "zh-CN": {...} }. Used by kit/sync-host.sh.
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const res = process.argv[2];
if (!res) { console.error('usage: sync-words.mjs <android res dir>'); process.exit(2); }
const KEYS = { today: 'today', tomorrow: 'tomorrow', yesterday: 'yesterday', just_now: 'justNow', now: 'now', min_ago: 'minutesAgo', h_ago: 'hoursAgo', in_min: 'inMinutes', in_h: 'inHours' };
const unescape = (s) => s.replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const out = {};
for (const dir of readdirSync(res).sort()) {
  if (dir !== 'values' && !dir.startsWith('values-')) continue;
  const f = join(res, dir, 'strings_plugins.xml');
  if (!existsSync(f)) continue;
  const tag = dir === 'values' ? '' : dir.slice('values-'.length).replace('-r', '-');
  const words = {};
  for (const m of readFileSync(f, 'utf8').matchAll(/<string name="plugin_rel_([a-z_]+)">([^<]*)<\/string>/g)) {
    if (KEYS[m[1]]) words[KEYS[m[1]]] = unescape(m[2]);
  }
  if (Object.keys(words).length) out[tag] = words;
}
process.stdout.write(JSON.stringify(out, null, 2) + '\n');
