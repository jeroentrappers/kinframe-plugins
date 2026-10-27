// Draws a plugin view (API 1) roughly the way the frame does, in its four forms: the corner on a photo, the band
// column (~80 px wide), the band strip, and the detail card on paper. Sizes follow the frame's FormMetrics (dp as
// px); colours its palettes. It is an approximation for authors, not pixel parity: the frame draws in Compose.
import { icon } from './icons.js';

export const PALETTES = {
  photo: { text: '#ffffff', soft: 'rgba(255,255,255,.82)', faint: 'rgba(255,255,255,.32)', good: '#A9E8B6', warn: '#FFD27A', bad: '#FFA092', accent: '#F8BC98', info: '#D3BBF7', water: '#B3EEFF', gas: '#FFA3D2', heat: '#FFB066', dim: 0.75 },
  paper: { text: '#2E2621', soft: '#6B5E55', faint: '#E6DACB', good: '#2E7D46', warn: '#8A5A00', bad: '#B3412F', accent: '#C0623E', info: '#6E46A8', water: '#1B7FD1', gas: '#A8306E', heat: '#D2691E', dim: 0.42 },
  dark: { text: '#F3EBE3', soft: '#BDAEA1', faint: '#3A322B', good: '#8CC39B', warn: '#F0C066', bad: '#F28B82', accent: '#F09A6D', info: '#C3A6F0', water: '#88DDF7', gas: '#E36FA9', heat: '#E8752A', dim: 0.42 },
};

// The frame's FormMetrics per form (core/.../plugin/ui/PluginTheme.kt).
export const METRICS = {
  corner: { icon: 34, value: 40, valueWeight: 300, unit: 21, label: 16, gap: 10, node: 50, nodeIcon: 26, nodeValue: 19, gauge: 76, stroke: 6, sparkW: 200, sparkH: 54, line1: 20, line2: 16, image: 76 },
  detail: { icon: 40, value: 46, valueWeight: 300, unit: 24, label: 17, gap: 12, node: 60, nodeIcon: 32, nodeValue: 21, gauge: 96, stroke: 7, sparkW: 420, sparkH: 96, line1: 21, line2: 17, image: 168 },
  column: { icon: 26, value: 21, valueWeight: 500, unit: 13, label: 12, gap: 4, node: 34, nodeIcon: 19, nodeValue: 14, gauge: 54, stroke: 5, sparkW: 64, sparkH: 30, line1: 13, line2: 12, image: 56 },
  strip: { icon: 26, value: 23, valueWeight: 500, unit: 14, label: 13, gap: 8, node: 34, nodeIcon: 19, nodeValue: 14, gauge: 56, stroke: 5, sparkW: 120, sparkH: 40, line1: 16, line2: 13, image: 56 },
};

const SVG = 'http://www.w3.org/2000/svg';
const NBSP = ' ';

function el(tag, cls, style, ...children) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (style) for (const [k, v] of Object.entries(style)) { if (k.startsWith('--')) e.style.setProperty(k, v); else e.style[k] = v; }
  for (const ch of children.flat()) if (ch !== null && ch !== undefined && ch !== false) e.append(typeof ch === 'string' ? document.createTextNode(ch) : ch);
  return e;
}
function svg(tag, attrs = {}, ...children) {
  const e = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null) e.setAttribute(k, v);
  children.flat().forEach((ch) => ch && e.append(ch));
  return e;
}

/** PluginFormat.splitUnit: "1,2 kW" → ["1,2", "kW"]; a unit is a short, non-numeric trailing word. */
export function splitUnit(value) {
  const i = Math.max(value.lastIndexOf(NBSP), value.lastIndexOf(' '), value.lastIndexOf(' '));
  if (i <= 0 || i === value.length - 1) return [value, null];
  const unit = value.slice(i + 1);
  return [...unit].length <= 4 && !/\d/.test(unit) ? [value.slice(0, i), unit] : [value, null];
}

const RAISED = /^([-−+]?(?:\d{1,3}(?:[.,'   ]\d{3})+|\d+))([.,])\d{1,2}[^\d.,\s]{0,2}$/;
/** PluginFormat.raisedDecimals: "21,4" → ["21,", "4"]; null when there is nothing to raise. */
export function raisedDecimals(n) {
  const m = RAISED.exec(n);
  if (!m || m[1].includes(m[2])) return null;
  return [n.slice(0, m[1].length + 1), n.slice(m[1].length + 1)];
}

/** A number as drawn: whole digits full size, one or two decimals small and raised, then the unit smaller. */
function number(text, unit, m, color, { size = m.value, weight = m.valueWeight, unitSize = m.unit } = {}) {
  let main = text, u = unit;
  if (!u) [main, u] = splitUnit(text);
  const r = raisedDecimals(main);
  const box = el('span', 'num', { color, fontSize: size + 'px', fontWeight: weight });
  if (r) box.append(r[0], el('span', 'raised', { fontSize: Math.round(size * 0.62) + 'px' }, r[1]));
  else box.append(main);
  if (u) box.append(el('span', 'unit', { fontSize: unitSize + 'px' }, u));
  return box;
}

class Ctx {
  constructor(form, palette) { this.form = form; this.p = PALETTES[palette]; this.m = METRICS[form]; this.palette = palette; }
  tone(t, inherited) { const k = t || inherited || 'neutral'; return k === 'neutral' ? this.p.text : this.p[k] || this.p.text; }
  get compact() { return this.form === 'column' || this.form === 'strip'; }
}

/**
 * Renders `view` in `form` ('corner' | 'detail' | 'column' | 'strip') on `palette` ('photo' | 'paper' | 'dark').
 * Returns an element (an empty one when the form doesn't draw the view, e.g. buttons outside the detail card).
 */
export function renderView(view, form, palette) {
  const c = new Ctx(form, palette);
  const root = el('div', `view form-${form} pal-${palette}`, { color: c.p.text, '--soft': c.p.soft, '--faint': c.p.faint });
  if (!view) { root.append(el('div', 'note', null, 'null: no new view (the last one stays)')); return root; }
  if (view.type === 'none') { root.append(el('div', 'note', null, 'none: the widget is hidden')); return root; }
  const node = component(view, c, undefined);
  if (node) root.append(node);
  else root.append(el('div', 'note', null, 'not drawn in this form'));
  return root;
}

function component(v, c, inherited) {
  switch (v.type) {
    case 'value': return value(v, c, inherited);
    case 'rows': return rows(v, c, inherited);
    case 'gauge': return gauge(v, c, inherited);
    case 'flow': return flow(v, c, inherited);
    case 'sparkline': return sparkline(v, c, inherited);
    case 'text': return text(v, c, inherited);
    case 'stack': return stack(v, c, inherited);
    case 'image': return image(v, c);
    case 'actions': return actions(v, c, inherited);
    case 'progress': return progress(v, c, inherited);
    case 'list': return list(v, c, inherited);
    default: return el('div', 'note', null, `unknown component ${v.type}`);
  }
}

function trendArrow(t, size, color) {
  if (!t) return null;
  const name = t === 'up' ? 'arrow-up' : t === 'down' ? 'arrow-down' : 'arrow-right';
  return icon(name, size, color);
}

function value(v, c, inherited) {
  const m = c.m, color = c.tone(v.tone, inherited);
  const ic = v.icon ? icon(v.icon, m.icon, color) : null;
  if (ic && v.icon_rotation) ic.style.transform = `rotate(${v.icon_rotation}deg)`;
  const num = number(v.value, v.unit, m, color);
  const label = v.label ? el('div', 'label', { fontSize: m.label + 'px' }, v.label) : null;
  const trend = trendArrow(v.trend, Math.round(m.unit * 1.1), c.p.soft);
  if (c.form === 'column') {
    const [main, unit] = v.unit ? [v.value, v.unit] : splitUnit(v.value);
    return el('div', 'value col', null, ic, number(main, null, m, color, {}), unit ? el('div', 'unit-below', { fontSize: m.unit + 'px', color }, unit) : null, trend);
  }
  return el('div', 'value', { gap: m.gap + 'px' }, ic, el('div', 'value-text', null, el('div', 'line', null, num, trend), label));
}

function rows(v, c, inherited) {
  const t = v.tone || inherited;
  if (c.form === 'column') return el('div', 'rows col', null, v.items.map((it) => value(it, c, t)));
  if (c.form === 'strip') return el('div', 'rows strip', { gap: c.m.gap * 2 + 'px' }, v.items.map((it) => {
    const color = c.tone(it.tone, t);
    return el('div', 'row', null, it.icon ? icon(it.icon, c.m.icon, color) : null, number(it.value, it.unit, c.m, color));
  }));
  const m = c.m;
  return el('div', 'rows table', null, v.items.map((it) => {
    const color = c.tone(it.tone, t);
    return el('div', 'row', null,
      it.icon ? icon(it.icon, Math.round(m.icon * 0.7), color) : el('span'),
      el('span', 'label', { fontSize: m.label + 'px' }, it.label || ''),
      number(it.value, it.unit, m, color, { size: Math.round(m.value * 0.62), unitSize: Math.round(m.unit * 0.75), weight: 400 }),
      trendArrow(it.trend, 14, c.p.soft) || el('span'));
  }));
}

function arc(cx, cy, r, from, to) {
  // Degrees clockwise from the top.
  const pt = (a) => [cx + r * Math.sin((a * Math.PI) / 180), cy - r * Math.cos((a * Math.PI) / 180)];
  const [x1, y1] = pt(from), [x2, y2] = pt(to);
  const large = Math.abs(to - from) > 180 ? 1 : 0;
  const sweep = to > from ? 1 : 0;
  return `M${x1.toFixed(2)} ${y1.toFixed(2)}A${r} ${r} 0 ${large} ${sweep} ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

function gauge(v, c, inherited) {
  const m = c.m, color = c.tone(v.tone, inherited), style = v.style || 'ring';
  const subs = v.sub ? el('div', 'subs', { fontSize: m.label + 'px' }, v.sub.map((s) => el('span', 'sub', null, s.icon ? icon(s.icon, m.label, c.tone(s.tone, inherited)) : null, s.value))) : null;
  const caption = v.caption ? el('div', 'label caption', { fontSize: m.label + 'px' }, v.caption) : null;
  if (style === 'bar') {
    const w = c.form === 'column' ? 64 : c.form === 'detail' ? 300 : 160;
    const bar = el('div', 'gbar', { width: w + 'px', height: m.stroke + 2 + 'px', background: c.p.faint }, el('div', null, { width: v.value + '%', background: color }));
    return el('div', 'gauge bar', null, el('div', 'line', null, v.icon ? icon(v.icon, Math.round(m.icon * 0.7), color) : null,
      el('span', 'num', { fontSize: Math.round(m.value * 0.6) + 'px', color }, v.label || `${Math.round(v.value)}%`)), bar, caption, subs);
  }
  const size = m.gauge, r = (size - m.stroke) / 2, cx = size / 2;
  const s = svg('svg', { width: size, height: size, viewBox: `0 0 ${size} ${size}` });
  if (style === 'dial') {
    s.append(svg('path', { d: arc(cx, cx, r, -150, 150), stroke: c.p.faint, 'stroke-width': m.stroke, fill: 'none', 'stroke-linecap': 'round' }));
    const deg = (v.value / 100) * 150;
    const col = v.value < 0 ? c.tone(v.negative_tone || v.tone, inherited) : color;
    if (Math.abs(deg) > 0.5) s.append(svg('path', { d: deg > 0 ? arc(cx, cx, r, 0, deg) : arc(cx, cx, r, deg, 0), stroke: col, 'stroke-width': m.stroke, fill: 'none', 'stroke-linecap': 'round' }));
    s.append(svg('path', { d: arc(cx, cx, r, -2, 2), stroke: col, 'stroke-width': m.stroke + 3, fill: 'none' }));
  } else {
    s.append(svg('circle', { cx, cy: cx, r, stroke: c.p.faint, 'stroke-width': m.stroke, fill: 'none' }));
    if (v.value > 0) s.append(svg('path', { d: v.value >= 100 ? `M${cx} ${cx - r}a${r} ${r} 0 1 1 -0.01 0` : arc(cx, cx, r, 0, v.value * 3.6), stroke: color, 'stroke-width': m.stroke, fill: 'none', 'stroke-linecap': 'round' }));
  }
  const labelText = v.label || `${Math.round(v.value)}%`;
  const [ln, lu] = style === 'dial' ? splitUnit(labelText) : [labelText, null];
  const inner = el('div', 'gauge-inner', null,
    v.icon && c.form !== 'column' ? icon(v.icon, Math.round(m.gauge * 0.2), c.p.soft) : null,
    el('div', 'num', { fontSize: Math.round(m.gauge * 0.2) + 'px', fontWeight: 500 }, ln),
    lu ? el('div', 'unit-below', { fontSize: Math.round(m.gauge * 0.13) + 'px', color: c.p.soft }, lu) : null);
  const ring = el('div', 'ring', { width: size + 'px', height: size + 'px' }, s, inner);
  if (c.form === 'column') return el('div', 'gauge col', null, ring, subs, caption);
  return el('div', 'gauge', { gap: m.gap + 'px' }, ring, (caption || subs) ? el('div', 'gauge-side', null, caption, subs) : null);
}

function flowLayout(v) {
  const deg = new Map(v.nodes.map((n) => [n.id, 0]));
  (v.edges || []).forEach((e) => { deg.set(e.from, deg.get(e.from) + 1); deg.set(e.to, deg.get(e.to) + 1); });
  const center = [...v.nodes].sort((a, b) => deg.get(b.id) - deg.get(a.id))[0];
  const others = v.nodes.filter((n) => n !== center);
  const slots = others.length === 1 ? ['left'] : ['left', 'right', 'top', 'bottom'];
  const pos = new Map([[center.id, 'center']]);
  others.forEach((n, i) => pos.set(n.id, slots[i]));
  return { center, pos };
}

function flowNode(n, c, inherited, showLabel) {
  const m = c.m, color = c.tone(n.tone, inherited);
  const size = m.node;
  const s = svg('svg', { width: size, height: size, viewBox: `0 0 ${size} ${size}` });
  const r = size / 2 - 2;
  s.append(svg('circle', { cx: size / 2, cy: size / 2, r, stroke: color, 'stroke-width': 1.8, fill: 'none', opacity: n.percent !== undefined ? 0.35 : 1 }));
  if (n.percent !== undefined && n.percent > 0) s.append(svg('path', { d: n.percent >= 100 ? `M${size / 2} ${size / 2 - r}a${r} ${r} 0 1 1 -0.01 0` : arc(size / 2, size / 2, r, 0, n.percent * 3.6), stroke: color, 'stroke-width': 3, fill: 'none', 'stroke-linecap': 'round' }));
  const circle = el('div', 'node-circle', { width: size + 'px', height: size + 'px' }, s, icon(n.icon, m.nodeIcon, color));
  return el('div', 'node', null, circle,
    n.value ? el('div', 'num', { fontSize: m.nodeValue + 'px', fontWeight: 500 }, n.value) : null,
    showLabel && n.label ? el('div', 'label', { fontSize: m.label + 'px' }, n.label) : null);
}

function chevrons(dir, power, max, color, faint) {
  const glyph = dir === 'left' ? '‹' : '›';
  const speed = max > 0 && power > 0 ? Math.max(0.4, 2.4 - (2 * power) / max) : 0;
  const e = el('span', `chev chev-${dir}`, { color: power > 0 ? color : faint }, glyph.repeat(3));
  if (speed) e.style.animationDuration = speed + 's'; else e.classList.add('idle');
  return e;
}

function flow(v, c, inherited) {
  const max = Math.max(0, ...(v.edges || []).map((e) => e.power || 0));
  if (c.compact) {
    // The band: the nodes in a line, arrows between neighbours that share an edge.
    const { center, pos } = flowLayout(v);
    const order = [...v.nodes].sort((a, b) => ['top', 'left', 'center', 'right', 'bottom'].indexOf(pos.get(a.id)) - ['top', 'left', 'center', 'right', 'bottom'].indexOf(pos.get(b.id)));
    const box = el('div', `flow ${c.form}`);
    order.forEach((n, i) => {
      if (i > 0) {
        const prev = order[i - 1];
        const e = (v.edges || []).find((x) => (x.from === prev.id && x.to === n.id) || (x.from === n.id && x.to === prev.id));
        const forward = e && e.from === prev.id;
        const dir = c.form === 'column' ? (forward ? 'down' : 'up') : forward ? 'right' : 'left';
        box.append(e ? chevrons(dir, e.power || 0, max, c.tone(v.tone, inherited), c.p.faint) : el('span', 'chev idle', null, ''));
      }
      box.append(flowNode(n, c, v.tone || inherited, false));
    });
    void center;
    return box;
  }
  const { center, pos } = flowLayout(v);
  const grid = el('div', 'flow grid');
  const cell = (slot) => { const d = el('div', `cell cell-${slot}`); grid.append(d); return d; };
  const cells = { top: cell('top'), left: cell('left'), center: cell('center'), right: cell('right'), bottom: cell('bottom'),
    'a-top': cell('a-top'), 'a-left': cell('a-left'), 'a-right': cell('a-right'), 'a-bottom': cell('a-bottom') };
  for (const n of v.nodes) cells[pos.get(n.id)].append(flowNode(n, c, v.tone || inherited, true));
  for (const e of v.edges || []) {
    const outer = e.from === center.id ? pos.get(e.to) : e.to === center.id ? pos.get(e.from) : null;
    if (!outer) continue; // an edge between two outer nodes: the frame curves it; the preview leaves it out
    const outward = e.from === center.id;
    const dir = { left: outward ? 'left' : 'right', right: outward ? 'right' : 'left', top: outward ? 'up' : 'down', bottom: outward ? 'down' : 'up' }[outer];
    cells['a-' + outer].append(chevrons(dir, e.power || 0, max, c.tone(v.tone, inherited), c.p.faint));
  }
  return grid;
}

function sparkline(v, c, inherited) {
  const m = c.m, color = c.tone(v.tone, inherited);
  const W = m.sparkW, H = m.sparkH;
  const nums = v.points.filter((x) => x !== null);
  let lo = v.min ?? Math.min(...nums), hi = v.max ?? Math.max(...nums);
  if (v.style === 'bars' && v.min === undefined) lo = Math.min(lo, 0);
  if (v.style === 'bars' && v.max === undefined) hi = Math.max(hi, 0);
  if (hi === lo) { hi += 1; lo -= 1; }
  const n = v.points.length;
  const x = (i) => (n === 1 ? W / 2 : (i / (n - 1)) * (W - 4) + 2);
  const y = (val) => H - 3 - ((Math.max(lo, Math.min(hi, val)) - lo) / (hi - lo)) * (H - 6);
  const s = svg('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, class: 'spark' });
  const picked = v.highlight !== undefined || v.marker !== undefined;
  const hiColor = v.highlight_tone ? c.tone(v.highlight_tone) : color;
  if (v.style === 'bars') {
    const bw = Math.max(1, (W - 4) / n - (n > 50 ? 0 : 1));
    const zero = y(Math.max(lo, Math.min(hi, 0)));
    v.points.forEach((val, i) => {
      if (val === null) return;
      const special = i === v.highlight || i === v.marker;
      const xx = (i / n) * (W - 4) + 2;
      const w = special && n > 50 ? Math.max(2, bw) : bw;
      const top = Math.min(y(val), zero), h = Math.max(1, Math.abs(zero - y(val)));
      s.append(svg('rect', { x: xx.toFixed(2), y: top.toFixed(2), width: w.toFixed(2), height: h.toFixed(2), fill: i === v.highlight ? hiColor : color, opacity: picked && !special ? c.p.dim : 1 }));
    });
  } else {
    let d = '', pen = false;
    v.points.forEach((val, i) => { if (val === null) { pen = false; return; } d += `${pen ? 'L' : 'M'}${x(i).toFixed(2)} ${y(val).toFixed(2)}`; pen = true; });
    s.append(svg('path', { d, stroke: color, 'stroke-width': c.compact ? 1.6 : 2, fill: 'none', 'stroke-linejoin': 'round', opacity: picked ? Math.max(c.p.dim, 0.6) : 1 }));
  }
  if (v.marker !== undefined) s.append(svg('line', { x1: x(v.marker), x2: x(v.marker), y1: 1, y2: H - 1, stroke: c.p.text, 'stroke-width': 1, opacity: 0.7 }));
  if (v.highlight !== undefined) {
    const val = v.points[v.highlight];
    const hx = v.style === 'bars' ? (v.highlight / n) * (W - 4) + 2 + 1 : x(v.highlight);
    s.append(svg('circle', { cx: hx, cy: y(val), r: c.compact ? 2 : 3, fill: hiColor }));
  }
  const fmt = (a) => (Math.abs(a) >= 100 ? a.toFixed(0) : Math.abs(a) >= 1 ? a.toFixed(1) : a.toPrecision(2));
  const range = v.show_range && !c.compact ? el('div', 'range', { fontSize: Math.round(m.label * 0.8) + 'px' }, el('span', null, null, fmt(Math.max(...nums))), el('span', null, null, fmt(Math.min(...nums)))) : null;
  const head = (v.label || v.value) ? el('div', 'spark-head', null,
    v.label && c.form !== 'column' ? el('span', 'label', { fontSize: m.label + 'px' }, v.label) : null,
    v.value ? number(v.value, null, m, c.p.text, { size: Math.round(m.value * (c.compact ? 0.62 : 0.5)), unitSize: Math.round(m.unit * 0.7), weight: 500 }) : null) : null;
  return el('div', 'sparkline', null, head, el('div', 'spark-body', null, s, range));
}

function text(v, c, inherited) {
  const m = c.m, color = c.tone(v.tone, inherited);
  return el('div', `text ${c.form}`, { gap: m.gap + 'px' }, v.icon ? icon(v.icon, Math.round(m.icon * (c.compact ? 0.8 : 0.75)), color) : null,
    el('div', 'lines', null, el('div', 'l1', { fontSize: m.line1 + 'px' }, v.lines[0]), v.lines[1] ? el('div', 'l2', { fontSize: m.line2 + 'px' }, v.lines[1]) : null));
}

function stack(v, c, inherited) {
  const dir = c.form === 'column' ? 'vertical' : c.form === 'strip' ? 'horizontal' : v.direction || 'vertical';
  const kids = v.items.map((it) => component(it, c, v.tone || inherited)).filter(Boolean);
  return el('div', `stack ${dir}`, { gap: c.m.gap + 'px' }, kids);
}

function image(v, c) {
  const size = c.m.image;
  const tile = el('div', `image ${v.shape || 'square'}`, { width: size + 'px', height: size + 'px', background: c.p.faint });
  const img = el('img', null, { width: '100%', height: '100%' });
  img.alt = v.description || '';
  img.referrerPolicy = 'no-referrer';
  img.onerror = () => { img.remove(); tile.title = `image (the frame fetches ${v.src})`; };
  img.src = v.src;
  tile.append(img);
  return tile;
}

function actions(v, c, inherited) {
  if (c.form !== 'detail') return null; // buttons are drawn only in the detail card
  return el('div', 'actions', null, v.items.map((a) => {
    const color = c.tone(a.tone, v.tone || inherited);
    const size = a.primary ? 64 : 52;
    const btn = el('div', `btn${a.primary ? ' primary' : ''}`, { width: size + 'px', height: size + 'px', borderColor: color, background: a.primary ? color : 'transparent' },
      icon(a.icon, a.primary ? 30 : 24, a.primary ? (c.palette === 'paper' ? '#fff' : '#2a1206') : color));
    btn.title = `action(ctx, '${a.id}')`;
    return el('div', 'action', null, btn, a.label ? el('div', 'label', { fontSize: '13px' }, a.label) : null);
  }));
}

const mmss = (s) => { s = Math.max(0, Math.round(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

function progress(v, c, inherited) {
  const m = c.m, color = c.tone(v.tone, inherited);
  const min = v.min ?? 0;
  const w = c.form === 'column' ? 64 : c.form === 'strip' ? 120 : c.form === 'detail' ? 400 : 200;
  const track = el('div', 'track', { width: w + 'px', background: c.p.faint });
  const fill = el('div', v.style === 'marker' ? 'dot' : 'fill', { background: color });
  track.append(fill);
  const time = v.time ? el('div', 'label', { fontSize: Math.round(m.label * 0.85) + 'px' }) : null;
  const t0 = performance.now();
  const draw = () => {
    let val = v.value;
    if (v.running) val = Math.min(v.max, v.value + (performance.now() - t0) / 1000);
    const f = ((val - min) / (v.max - min)) * 100;
    if (v.style === 'marker') fill.style.left = `calc(${f}% - 5px)`; else fill.style.width = f + '%';
    if (time) time.textContent = `${mmss(val)} / ${mmss(v.max)}`;
    if (v.running && val < v.max && fill.isConnected !== false) requestAnimationFrame(draw);
  };
  draw();
  return el('div', 'progress', null, v.label ? el('div', 'label', { fontSize: m.label + 'px' }, v.label) : null, track, time);
}

function list(v, c, inherited) {
  const m = c.m;
  const toneOf = (r) => c.tone(r.tone, v.tone || inherited);
  const plain = c.p.text;
  if (c.form === 'column') {
    const timed = v.rows.some((r) => r.time);
    const first = v.rows[0];
    if (!timed) return el('div', 'list col', null, first.icon ? icon(first.icon, m.icon, toneOf(first)) : null, el('div', 'clamp3', { fontSize: m.line1 + 'px' }, first.title));
    return el('div', 'list col', null, first.icon ? icon(first.icon, Math.round(m.icon * 0.85), toneOf(first)) : null,
      v.rows.slice(0, 3).filter((r) => r.time).map((r) => {
        const short = r.badge && [...r.badge].length <= 4;
        return el('div', 'ct', { fontSize: m.line1 + 'px' },
          el('span', null, { color: r.badge && !short ? toneOf(r) : plain, fontWeight: 500 }, r.time),
          short ? el('span', 'badge', { color: toneOf(r), fontSize: Math.round(m.line2 * 0.9) + 'px' }, r.badge) : null);
      }));
  }
  const rowsShown = c.form === 'detail' ? v.rows : c.form === 'strip' ? v.rows.slice(0, 2) : v.rows.slice(0, 3);
  const size = c.form === 'strip' ? m.line2 : c.form === 'detail' ? m.line1 : m.line1;
  const table = el('div', `list ${c.form}`, { fontSize: size + 'px' });
  if (v.label && c.form !== 'strip') table.append(el('div', 'label list-label', { fontSize: m.label + 'px' }, v.label));
  const grid = el('div', 'list-grid');
  for (const r of rowsShown) {
    grid.append(
      r.icon ? icon(r.icon, Math.round(size * 1.05), toneOf(r)) : el('span'),
      el('span', 'time', null, r.time || ''),
      el('span', 'title', null, r.title),
      el('span', 'detail', null, r.detail || ''),
      el('span', 'badge', { color: toneOf(r) }, r.badge || ''));
  }
  table.append(grid);
  return table;
}
