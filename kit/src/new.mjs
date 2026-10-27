// `kit new <id>`: a new plugin folder that already runs (`kit test` passes); `kit check` lists the TODOs to fill in.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { PLUGINS_DIR } from './paths.mjs';
import { ID } from './manifest.mjs';
import { readPlugin } from './plugins.mjs';
import { testScenario, scenarioFiles } from './scenario.mjs';
import { checkLicense } from './check.mjs';

const title = (id) => id.split('.').slice(1).join(' ').replace(/-/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

function gitName() {
  try { return execFileSync('git', ['config', 'user.name'], { encoding: 'utf8' }).trim() || null; } catch { return null; }
}

export function files(id, { name = title(id), author = 'Your Name', license = 'MIT' } = {}) {
  const manifest = {
    id, name, version: '0.1.0', api: 1,
    author: { name: author },
    license,
    description: `TODO: one sentence on what ${name} shows and where it comes from.`,
    refresh: { min_seconds: 300, default_seconds: 900 },
    permissions: { http: ['https://api.example.org'] },
    settings: [
      { key: 'place', type: 'text', label: 'Place', required: true, placeholder: 'Brussels', help: 'TODO: what to type here.' },
    ],
  };
  const main = `// @ts-check
// ${name}: TODO what it shows and where the data comes from.
//
// update() is the only call that may use the network: it fetches and keeps what it needs in ctx.state.
// render() draws the corner and band view from ctx.state, detail() the card on tap; neither can fetch, so the frame
// never waits for the network to draw.

/**
 * The views for what update() kept, or null while there is nothing yet.
 * @param {{ value: number, unit: string, time: number } | undefined} data
 * @param {import('kinframe').Ctx} ctx
 * @returns {{ main: import('kinframe').ValueView, detail: import('kinframe').StackView } | null}
 */
export function views(data, ctx) {
  if (!data || typeof data.value !== 'number') return null;
  /** @type {import('kinframe').ValueView} */
  const main = { type: 'value', value: ctx.format.number(data.value, 1, data.unit), label: ctx.t('label'), icon: 'info' };
  /** @type {import('kinframe').StackView} */
  const detail = {
    type: 'stack',
    items: [main, { type: 'text', lines: [ctx.t('updated', { when: ctx.format.ago(data.time) })] }],
  };
  return { main, detail };
}

/** @type {import('kinframe').Plugin} */
export default {
  async update(ctx) {
    const place = String(ctx.settings.place || '').trim();
    if (!place) return;
    const r = await ctx.http.get('https://api.example.org/v1/value?place=' + encodeURIComponent(place));
    if (!r.ok) throw new Error('api.example.org: HTTP ' + r.status);
    const j = r.json();
    ctx.state.data = { value: j.value, unit: j.unit, time: Date.parse(j.time) || ctx.now() };
  },

  render(ctx) {
    const v = views(ctx.state.data, ctx);
    return v && v.main;
  },

  detail(ctx) {
    const v = views(ctx.state.data, ctx);
    return v && v.detail;
  },
};
`;
  const en = {
    '@name': name,
    '@description': manifest.description,
    '@setting.place': 'Place',
    '@setting.place.help': 'TODO: what to type here.',
    '@setting.place.placeholder': 'Brussels',
    label: 'Right now',
    updated: 'Updated {when}',
  };
  const nl = {
    '@name': name,
    '@description': 'TODO: één zin over wat dit toont en waar het vandaan komt.',
    '@setting.place': 'Plaats',
    '@setting.place.help': 'TODO: wat je hier invult.',
    '@setting.place.placeholder': 'Brussel',
    label: 'Nu',
    updated: '{when} bijgewerkt',
  };
  const fixture = { place: 'Brussels', value: 21.4, unit: '°C', time: '2026-10-25T09:52:00Z' };
  const scenario = {
    description: 'TODO: what this scenario shows. Recorded from the real API, without tokens or personal data.',
    language: 'en',
    now: '2026-10-25T10:00:00Z',
    settings: { place: 'Brussels' },
    http: [{ url: 'https://api.example.org/v1/value?place=Brussels', bodyFile: 'fixtures/brussels.json' }],
    steps: ['start', 'update', 'render', 'detail'],
  };
  const readme = `# ${name}

TODO: what the widget shows, with a screenshot from \`npm run kit -- preview ${id}\`.

## Setting it up

- **Place:** TODO.

## What it may do

- **Internet:** \`https://api.example.org\` only. TODO: why it needs it.

Licence: ${license}.
`;
  return {
    'plugin.json': JSON.stringify(manifest, null, 2) + '\n',
    'main.js': main,
    'locales/en.json': JSON.stringify(en, null, 2) + '\n',
    'locales/nl.json': JSON.stringify(nl, null, 2) + '\n',
    'fixtures/brussels.json': JSON.stringify(fixture, null, 2) + '\n',
    'scenarios/brussels.json': JSON.stringify(scenario, null, 2) + '\n',
    'README.md': readme,
  };
}

export async function cmdNew(pos, opt, root = PLUGINS_DIR) {
  const id = pos[0];
  if (!id) { console.error('kit new <id>, e.g. kit new community.tide-times'); return 2; }
  if (id.length > 64 || !ID.test(id)) { console.error(`${id}: an id looks like community.my-plugin (lowercase letters, digits, - and .)`); return 2; }
  if (!id.startsWith('community.')) { console.error(`${id}: plugins in this repository start with "community."`); return 2; }
  const license = typeof opt.license === 'string' ? opt.license : 'MIT';
  const lic = checkLicense(license);
  if (lic) { console.error(lic); return 2; }
  const dir = join(root, id);
  if (existsSync(dir)) { console.error(`${relative(process.cwd(), dir)} already exists`); return 1; }
  const author = typeof opt.author === 'string' ? opt.author : gitName() || 'Your Name';
  for (const [f, text] of Object.entries(files(id, { author, license, name: typeof opt.name === 'string' ? opt.name : undefined }))) {
    mkdirSync(join(dir, f, '..'), { recursive: true });
    writeFileSync(join(dir, f), text);
  }
  const plugin = readPlugin(dir);
  for (const s of scenarioFiles(dir)) await testScenario(plugin, s, { update: true });
  console.log(`created ${relative(process.cwd(), dir)}/: plugin.json, main.js, locales/en.json + nl.json, fixtures/, scenarios/ (with its snapshot), README.md

Next:
  npm run kit -- preview ${id}     see it in the frame's forms
  npm run kit -- check ${id}       the rules CI applies (it lists the TODOs left)
  npm run kit -- test ${id}        the scenarios against their snapshots (--update to accept changes)
Then replace every TODO, point it at your API, record a real answer into fixtures/ and open a pull request.`);
  return 0;
}
