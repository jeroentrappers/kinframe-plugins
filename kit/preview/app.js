// The preview page: runs the chosen plugin's scenarios on the kit's server and draws every view in the frame's forms.
// Reloads when the plugin's files (or the kit's preview) change.
import { renderView } from './render.js';

const $ = (s) => document.querySelector(s);
const main = $('#main'), status = $('#status'), pick = $('#plugin'), pal = $('#palette');
const params = new URLSearchParams(location.search);

function h(tag, cls, ...kids) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  kids.flat().forEach((k) => k != null && e.append(typeof k === 'string' ? document.createTextNode(k) : k));
  return e;
}

function box(name, surface, node) {
  return h('div', 'form-box', h('div', 'form-name', name), (() => { surface.append(node); return surface; })());
}

/** The four forms for one view: corner on a photo, band column and strip, detail card. */
function forms(view, detailView, title, palette) {
  const paperCls = palette === 'dark' ? 'paper dark' : 'paper';
  const card = h('div', `card ${paperCls}`, h('div', 'card-title', title));
  card.append(renderView(detailView, 'detail', palette));
  return h('div', 'forms',
    box('corner', h('div', 'photo'), renderView(view, 'corner', 'photo')),
    box('band column', h('div', `column ${paperCls}`), renderView(view, 'column', palette)),
    box('band strip', h('div', `strip ${paperCls}`), renderView(view, 'strip', palette)),
    box(detailView === view ? 'detail card (render: no detail())' : 'detail card', card, document.createDocumentFragment()));
}

function messages(list, kind) {
  return (list || []).map((m) => h('div', `msg ${kind}`, (kind === 'warning' ? 'warning: ' : '') + m));
}

function drawPlugin(data, palette) {
  main.replaceChildren();
  if (data.error) { main.append(h('div', 'msg error', data.error)); return; }
  const head = h('div', 'plugin-head', h('h2', null, `${data.name} `, h('span', 'form-name', `${data.id} ${data.version || ''}`)), h('p', null, data.description || ''));
  if (data.permissions) head.append(h('div', 'perm', 'may reach: ', h('code', null, (data.permissions.http || []).join(', ') || 'nothing'), data.permissions.location ? ' · reads the frame\'s place' : '', data.permissions.actions ? ' · buttons' : ''));
  head.append(...messages(data.check?.errors, 'error'), ...messages(data.check?.warnings, 'warning'));
  main.append(head);
  for (const sc of data.scenarios) {
    const sec = h('section', 'scenario', h('h3', null, sc.name), sc.description ? h('div', 'desc', sc.description) : null);
    sec.append(...messages(sc.errors, 'error'), ...messages(sc.warnings, 'warning'));
    const steps = (sc.record?.steps || []);
    const detail = [...steps].reverse().find((s) => s.call === 'detail' && 'view' in s);
    let shown = 0;
    steps.forEach((s, i) => {
      if (!('view' in s) || s.call === 'detail') return;
      shown++;
      const dv = detail && detail.view ? detail.view : s.view;
      sec.append(h('div', 'step', h('div', 'step-name', `step ${i + 1}: ${s.call}`), forms(s.view, dv, data.name, palette)));
    });
    if (!shown && detail) sec.append(h('div', 'step', h('div', 'step-name', 'detail'), forms(detail.view, detail.view, data.name, palette)));
    const pre = h('pre', null, JSON.stringify(sc.record, null, 2));
    sec.append(h('details', 'json', h('summary', null, 'what the plugin returned'), pre));
    main.append(sec);
  }
}

function drawGallery(data, palette) {
  main.replaceChildren(h('div', 'plugin-head', h('h2', null, 'Every view in the schema'), h('p', null, 'The examples from the frame\'s view schema (kit/host/views/examples), in every form.')));
  for (const ex of data.examples) {
    main.append(h('section', 'scenario', h('h3', null, ex.name), forms(ex.view, ex.view, ex.name, palette)));
  }
}

async function load() {
  const id = pick.value;
  const palette = pal.value;
  status.textContent = 'running…';
  const t0 = performance.now();
  try {
    const r = await fetch(id === '*gallery' ? '/api/gallery' : `/api/run?id=${encodeURIComponent(id)}`);
    const data = await r.json();
    if (id === '*gallery') drawGallery(data, palette); else drawPlugin(data, palette);
    status.textContent = `ran in ${Math.round(performance.now() - t0)} ms · ${new Date().toLocaleTimeString()}`;
  } catch (e) {
    status.textContent = 'failed: ' + e.message;
  }
}

async function init() {
  const ids = await (await fetch('/api/plugins')).json();
  for (const id of ids) pick.append(new Option(id, id));
  pick.append(new Option('(every view type)', '*gallery'));
  pick.value = params.get('id') && [...pick.options].some((o) => o.value === params.get('id')) ? params.get('id') : ids[0] || '*gallery';
  pal.value = params.get('palette') || 'paper';
  const sync = () => { const q = new URLSearchParams({ id: pick.value, palette: pal.value }); history.replaceState(null, '', '?' + q); load(); };
  pick.onchange = sync; pal.onchange = sync;
  await load();
  const ev = new EventSource('/api/events');
  ev.onmessage = (m) => { if (m.data === 'reload') load(); else if (m.data === 'reload-page') location.reload(); };
}

init();
