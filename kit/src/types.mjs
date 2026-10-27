// `kit types [--out dir]`: type checking for plugins written in plain JavaScript. In this repository the root
// jsconfig.json maps 'kinframe' and 'kinframe/*' to kit/types, so `// @ts-check` and
// `/** @type {import('kinframe').Plugin} */` give completion and checks in any editor that speaks TypeScript.
// --out copies the declarations elsewhere (for a plugin developed outside this repository) with a jsconfig.json.
import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';
import { KIT_DIR, REPO_DIR } from './paths.mjs';

export const JSCONFIG = {
  compilerOptions: {
    checkJs: true, allowJs: true, noEmit: true, strict: false, target: 'ES2020', module: 'ESNext', moduleResolution: 'Bundler',
    lib: ['ES2020'], types: [], baseUrl: '.',
    paths: { kinframe: ['kit/types/kinframe.d.ts'], 'kinframe/*': ['kit/types/lib/*.d.ts'] },
  },
  include: ['plugins/*/main.js'],
};

export async function cmdTypes(opt) {
  const types = join(KIT_DIR, 'types');
  if (opt.out && opt.out !== true) {
    const out = resolve(opt.out);
    mkdirSync(out, { recursive: true });
    cpSync(types, join(out, 'kinframe-types'), { recursive: true });
    const cfg = structuredClone(JSCONFIG);
    cfg.compilerOptions.paths = { kinframe: ['kinframe-types/kinframe.d.ts'], 'kinframe/*': ['kinframe-types/lib/*.d.ts'] };
    cfg.include = ['main.js'];
    const jc = join(out, 'jsconfig.json');
    if (!existsSync(jc)) writeFileSync(jc, JSON.stringify(cfg, null, 2) + '\n');
    console.log(`copied the declarations to ${relative(process.cwd(), join(out, 'kinframe-types')) || '.'}${existsSync(jc) ? ' (jsconfig.json there)' : ''}`);
    return 0;
  }
  const jc = join(REPO_DIR, 'jsconfig.json');
  if (!existsSync(jc)) { writeFileSync(jc, JSON.stringify(JSCONFIG, null, 2) + '\n'); console.log('wrote jsconfig.json'); }
  console.log(`types: ${relative(process.cwd(), types)}/kinframe.d.ts (ctx, Plugin), plugin-view.d.ts (views), lib/*.d.ts (kinframe/ha, …)`);
  console.log('In main.js:  // @ts-check   and   /** @type {import(\'kinframe\').Plugin} */ above export default.');
  console.log('Check from the command line: npx -p typescript tsc -p jsconfig.json');
  return 0;
}
