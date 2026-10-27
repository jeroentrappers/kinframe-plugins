// `kit preview [id] [--port 8770]`: a local web page that runs a plugin's scenarios in the sandbox and draws each view
// in the frame's forms. Plain node:http, no framework; the page reloads its data when the plugin's files change.
import { createServer } from 'node:http';
import { readFileSync, readdirSync, watch } from 'node:fs';
import { join, extname, basename } from 'node:path';
import { KIT_DIR, PLUGINS_DIR, HOST_DIR } from './paths.mjs';
import { pluginDirs, readPlugin } from './plugins.mjs';
import { scenarioFiles, runScenario } from './scenario.mjs';
import { checkPlugin } from './check.mjs';

const STATIC = join(KIT_DIR, 'preview');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json' };

async function runPlugin(dir) {
  const plugin = readPlugin(dir);
  const out = { id: plugin.manifest?.id || plugin.folder, name: plugin.manifest?.name || plugin.folder, version: plugin.manifest?.version, description: plugin.manifest?.description, permissions: plugin.manifest?.permissions, scenarios: [] };
  const check = checkPlugin(plugin);
  out.check = { errors: check.errors, warnings: check.warnings };
  if (!plugin.manifest) { out.error = `plugin.json: ${plugin.manifestError}`; return out; }
  for (const f of scenarioFiles(dir)) {
    let description = null;
    try { description = JSON.parse(readFileSync(f, 'utf8')).description || null; } catch { /* reported by runScenario */ }
    const r = await runScenario(plugin, f);
    out.scenarios.push({ name: r.name, description, record: r.record, errors: r.errors, warnings: r.warnings });
  }
  return out;
}

function gallery() {
  const dir = join(HOST_DIR, 'views', 'examples');
  return { examples: readdirSync(dir).filter((f) => f.endsWith('.json')).sort().map((f) => ({ name: basename(f, '.json'), view: JSON.parse(readFileSync(join(dir, f), 'utf8')) })) };
}

export async function cmdPreview(pos, opt) {
  const dirs = pluginDirs(pos);
  const byId = new Map(dirs.map((d) => [basename(d), d]));
  const port = Number(opt.port || process.env.PORT || 8770);
  const clients = new Set();
  const json = (res, code, body) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); };

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    try {
      if (url.pathname === '/api/plugins') return json(res, 200, [...byId.keys()]);
      if (url.pathname === '/api/gallery') return json(res, 200, gallery());
      if (url.pathname === '/api/run') {
        const dir = byId.get(url.searchParams.get('id'));
        if (!dir) return json(res, 404, { error: 'no such plugin' });
        return json(res, 200, await runPlugin(dir));
      }
      if (url.pathname === '/api/events') {
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
        res.write('retry: 1000\n\n');
        clients.add(res);
        req.on('close', () => clients.delete(res));
        return;
      }
      const file = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
      if (!/^[a-z0-9.-]+$/.test(file)) { res.writeHead(404); return res.end('not found'); }
      const body = readFileSync(join(STATIC, file));
      res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(body);
    } catch (e) {
      if (e.code === 'ENOENT') { res.writeHead(404); res.end('not found'); return; }
      json(res, 500, { error: e.message });
    }
  });

  let timer = null;
  const notify = (what) => {
    clearTimeout(timer);
    timer = setTimeout(() => { for (const c of clients) c.write(`data: ${what}\n\n`); }, 150);
  };
  const watchers = [];
  try { watchers.push(watch(PLUGINS_DIR, { recursive: true }, (_e, f) => { if (f && !String(f).endsWith('.snap.json')) notify('reload'); })); } catch { /* no recursive watch here: reload by hand */ }
  try { watchers.push(watch(STATIC, () => notify('reload-page'))); } catch { /* ignore */ }

  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  const first = dirs[0] ? `?id=${encodeURIComponent(basename(dirs[0]))}` : '';
  console.log(`preview on http://127.0.0.1:${port}/${first}  (Ctrl-C to stop)`);
  const stop = () => { watchers.forEach((w) => w.close()); for (const c of clients) c.end(); server.close(); process.exit(0); };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  return new Promise(() => {});
}
