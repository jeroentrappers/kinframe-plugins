// @ts-check
// The next departures from a Belgian station (iRail, https://docs.irail.be), as a `list`: time, destination,
// platform and the delay as a badge. In the band the list shrinks to the times and their delays (kinframe docs/plugins.md §4.3).
//
// Terms: iRail is a free, community-run API over NMBS/SNCB data; it asks for a recognisable User-Agent (the frame
// sends kinframe-frame/<version>), moderate polling (at most once a minute here) and credit, shown in the detail card.

/**
 * @param {any} json an iRail liveboard
 * @param {import('kinframe').Ctx} ctx
 * @returns {import('kinframe').ListView | import('kinframe').TextView}
 */
export function board(json, ctx) {
  const towards = (ctx.settings.towards || '').trim().toLowerCase();
  const all = ((json.departures && json.departures.departure) || []).filter((d) => d.left !== '1');
  const deps = all.filter((d) => !towards || d.station.toLowerCase().includes(towards)).slice(0, Math.max(1, Math.min(5, ctx.settings.count | 0 || 3)));
  if (!deps.length) return { type: 'text', lines: [ctx.t('none')], icon: 'train' };
  const station = json.stationinfo && json.stationinfo.standardname;
  return {
    type: 'list',
    label: station ? station.slice(0, 32) : undefined,
    rows: deps.map((d) => {
      const delay = Math.round((+d.delay || 0) / 60);
      const canceled = d.canceled === '1';
      return {
        time: ctx.format.time(+d.time * 1000),
        title: d.station.slice(0, 40),
        detail: ctx.t('platform', { n: d.platform }).slice(0, 16),
        badge: canceled ? ctx.t('canceled').slice(0, 10) : delay > 0 ? '+' + delay : undefined,
        icon: 'train',
        tone: canceled ? 'bad' : delay >= 5 ? 'warn' : undefined,
      };
    }),
  };
}

/**
 * The board with its source under it, for the detail card.
 * @param {any} json
 * @param {import('kinframe').Ctx} ctx
 * @returns {import('kinframe').StackView}
 */
export function detail(json, ctx) {
  return { type: 'stack', items: [board(json, ctx), { type: 'text', lines: [ctx.t('source')] }] };
}

/** @type {import('kinframe').Plugin} */
export default {
  async update(ctx) {
    const st = encodeURIComponent(String(ctx.settings.station || '').trim());
    if (!st) return;
    const lang = ctx.language.slice(0, 2);
    const r = await ctx.http.get(`https://api.irail.be/v1/liveboard/?station=${st}&format=json&arrdep=departure&lang=${['nl', 'fr', 'de', 'en'].includes(lang) ? lang : 'en'}`);
    if (!r.ok) throw new Error('iRail: HTTP ' + r.status);
    ctx.state.board = r.json();
  },
  render(ctx) {
    return ctx.state.board ? board(ctx.state.board, ctx) : null;
  },
  detail(ctx) {
    return ctx.state.board ? detail(ctx.state.board, ctx) : null;
  },
};
