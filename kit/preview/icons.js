// Line icons for the preview, one per name in the view schema's icon set (24 × 24, stroked in currentColor). Drawn
// for the kit in the spirit of the frame's line style; they are stand-ins, not the frame's own artwork. A name the
// kit doesn't know yet (an icon added upstream) shows as a dashed circle.
const c = (cx, cy, r) => `<circle cx="${cx}" cy="${cy}" r="${r}"/>`;
const p = (d) => `<path d="${d}"/>`;
const rect = (x, y, w, h, rx = 0) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}"/>`;
const dot = (x, y) => `<circle cx="${x}" cy="${y}" r="1.1" fill="currentColor" stroke="none"/>`;
const blade = 'M12 12c-1-3.5 0-7.5 3-8 2.5-.4 3 3-3 8z';

export const ICONS = {
  bolt: p('M13 2 4 14h7l-1 8 9-12h-7z'),
  grid: p('M12 2 7 22M12 2l5 20M8.2 8h7.6M6.6 14h10.8M8.2 8l7 6M15.8 8l-7 6'),
  solar: rect(3, 4, 18, 11, 1) + p('M3 9.5h18M9 4v11M15 4v11M12 15v4M8 20h8'),
  sun: c(12, 12, 4) + p('M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4'),
  home: p('M3 11 12 4l9 7M5 9.5V20h14V9.5M10 20v-6h4v6'),
  battery: rect(2, 7, 17, 10, 2) + p('M21.5 10.5v3'),
  'battery-charging': rect(2, 7, 17, 10, 2) + p('M21.5 10.5v3M11 8.5l-2.5 4h3.5L9.5 15.5'),
  plug: p('M9 2v5M15 2v5M6.5 7h11v4a5.5 5.5 0 0 1-11 0zM12 16.5V22'),
  car: p('M3.5 13 5.6 8A2 2 0 0 1 7.4 6.8h9.2A2 2 0 0 1 18.4 8l2.1 5v5h-17zM3.5 13h17M6 18v2M18 18v2') + dot(7.5, 15.5) + dot(16.5, 15.5),
  flame: p('M12 2.5c.8 3.6 6 5.8 6 11.5a6 6 0 0 1-12 0c0-2.8 1.6-4.8 2.8-6.4.2 2.6 1.4 3.9 2.9 3.9.1-3.6-1.1-5.9.3-9z'),
  gas: p('M8 7h8v13a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1zM10 3.5h4V7h-4zM8 11h8'),
  meter: c(12, 13, 8) + p('M12 13l4.2-4.2M7.5 13h1M15.5 13h1M12 8.5v1'),
  water: p('M12 3s6 6.8 6 11a6 6 0 0 1-12 0c0-4.2 6-11 6-11z'),
  thermometer: p('M10 4.5a2 2 0 0 1 4 0v10a4 4 0 1 1-4 0zM12 9v7.5'),
  wind: p('M3 8.5h11a3 3 0 1 0-3-3M3 12.5h15a3 3 0 1 1-3 3M3 16.5h7'),
  leaf: p('M5 19C5 9.5 10.5 4.5 20 4.5c0 9.5-5 14.5-15 14.5zM5 19l7.5-7.5'),
  euro: p('M17.5 6.5a7 7 0 1 0 0 11M4 10h10M4 14h10'),
  fan: `<g>${p(blade)}</g><g transform="rotate(120 12 12)">${p(blade)}</g><g transform="rotate(240 12 12)">${p(blade)}</g>` + c(12, 12, 1.4),
  lightbulb: p('M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3z'),
  moon: p('M20 14.5A8.5 8.5 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z'),
  cloud: p('M7 18.5h10a4 4 0 0 0 .3-8 6 6 0 0 0-11.6 1.6A3.5 3.5 0 0 0 7 18.5z'),
  clock: c(12, 12, 9) + p('M12 7v5l3 2'),
  calendar: rect(3, 5, 18, 16, 2) + p('M3 10h18M8 3v4M16 3v4'),
  rain: p('M7 14.5h10a4 4 0 0 0 .3-8 6 6 0 0 0-11.6 1.6A3.5 3.5 0 0 0 7 14.5zM8.5 17.5l-1 3M12.5 17.5l-1 3M16.5 17.5l-1 3'),
  direction: p('M12 3l5.5 17L12 16l-5.5 4z'),
  'washing-machine': rect(4, 3, 16, 18, 2) + c(12, 13, 4.5) + p('M7 6.5h2M14 6.5h.01'),
  trash: p('M4 7h16M9.5 7V4h5v3M6 7l1 14h10l1-14M10 11v6M14 11v6'),
  door: p('M6 21V3h12v18M3.5 21h17') + dot(14.5, 12),
  lock: rect(5, 11, 14, 10, 2) + p('M8 11V7.5a4 4 0 0 1 8 0V11'),
  bike: c(6, 16, 3.5) + c(18, 16, 3.5) + p('M6 16l3.5-7.5h5.5L18 16M9.5 8.5 12.5 16M14 5.5h2.5'),
  bus: rect(4, 3, 16, 15, 2) + p('M4 10.5h16M7 18v3M17 18v3') + dot(8, 14.5) + dot(16, 14.5),
  train: rect(5, 3, 14, 14, 3) + p('M5 10h14M8.5 21l2-4M15.5 21l-2-4') + dot(9, 13.5) + dot(15, 13.5),
  user: c(12, 8, 4) + p('M4 21a8 8 0 0 1 16 0'),
  wifi: p('M2.5 9a14 14 0 0 1 19 0M5.5 12.5a9.5 9.5 0 0 1 13 0M8.8 16a5 5 0 0 1 6.4 0') + dot(12, 19.5),
  bell: p('M6 16v-5a6 6 0 0 1 12 0v5l2 2H4zM10 21h4'),
  info: c(12, 12, 9) + p('M12 11v6') + dot(12, 7.8),
  warning: p('M12 3.5 21.5 20h-19zM12 10v5') + dot(12, 17.5),
  check: p('M4.5 12.5l5 5L20 6.5'),
  'arrow-up': p('M12 20V4M5 11l7-7 7 7'),
  'arrow-down': p('M12 4v16M5 13l7 7 7-7'),
  'arrow-left': p('M20 12H4M11 5l-7 7 7 7'),
  'arrow-right': p('M4 12h16M13 5l7 7-7 7'),
  music: p('M9 18V5.5l11-2V16') + c(6, 18, 3) + c(17, 16, 3),
  play: p('M7 4.5 19.5 12 7 19.5z'),
  pause: p('M8.5 4.5v15M15.5 4.5v15'),
  'skip-next': p('M5 4.5 15.5 12 5 19.5zM19 4.5v15'),
  'skip-previous': p('M19 4.5 8.5 12 19 19.5zM5 4.5v15'),
  'volume-up': p('M4 9h4l5-4v14l-5-4H4zM16.5 9a4 4 0 0 1 0 6M19.5 6a8 8 0 0 1 0 12'),
  'volume-down': p('M4 9h4l5-4v14l-5-4H4zM16.5 9a4 4 0 0 1 0 6'),
  'volume-off': p('M4 9h4l5-4v14l-5-4H4zM16.5 9.5l5 5M21.5 9.5l-5 5'),
  power: p('M12 3v8.5M6.3 6.8a8 8 0 1 0 11.4 0'),
};

/** An <svg> element for an icon name. */
export function icon(name, size, color) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('width', size);
  s.setAttribute('height', size);
  s.setAttribute('fill', 'none');
  s.setAttribute('stroke', 'currentColor');
  s.setAttribute('stroke-width', '1.7');
  s.setAttribute('stroke-linecap', 'round');
  s.setAttribute('stroke-linejoin', 'round');
  s.setAttribute('class', 'icon');
  s.setAttribute('aria-hidden', 'true');
  if (color) s.style.color = color;
  s.innerHTML = ICONS[name] || '<circle cx="12" cy="12" r="8" stroke-dasharray="3 3"/>';
  return s;
}
