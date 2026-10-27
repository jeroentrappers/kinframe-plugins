// @ts-check
// Day-ahead prices per quarter hour (Energy-Charts), as bars with "now" marked and the cheapest quarter hour
// still to come highlighted. A day has 96 quarter hours, 92 or 100 when the clocks change; bars take up to 100.
//
// Terms: Energy-Charts publishes the prices of the zones offered here (BE, NL, DE-LU, FR, AT) under CC BY 4.0 from
// Bundesnetzagentur | SMARD.de; other zones are for private use only, so they aren't offered, and an answer without
// that licence isn't shown. The detail card credits the source. At most one request per 15 minutes (the prices change
// once a day); a 429 is reported as such and the next refresh tries again.

/**
 * The price now (main) and the day as bars (detail), or null without prices.
 * @param {any} json
 * @param {import('kinframe').Ctx} ctx
 * @returns {{ main: import('kinframe').ValueView, detail: import('kinframe').StackView } | null}
 */
export function view(json, ctx) {
  const t = json.unix_seconds || [], p = json.price || [];
  if (!t.length) return null;
  const now = ctx.now() / 1000;
  let i = t.findIndex((s, k) => s <= now && (k === t.length - 1 || t[k + 1] > now));
  if (i < 0) i = 0;
  const kwh = (mwh) => mwh / 1000;
  let cheap = 0;
  for (let k = i; k < p.length; k++) if (p[k] < p[cheap] || cheap < i) cheap = k;
  const fmt = (mwh) => ctx.format.number(kwh(mwh), 3, '€/kWh');
  /** @type {import('kinframe').ValueView} */
  const main = {
    type: 'value', value: fmt(p[i]), label: ctx.t('cheapest', { time: ctx.format.time(t[cheap] * 1000) }), icon: 'euro',
    tone: p[i] <= 0 ? 'good' : p[i] > 150 ? 'warn' : undefined,
  };
  const pts = p.slice(0, 100).map(kwh);
  /** @type {import('kinframe').SparklineView} */
  const chart = { type: 'sparkline', style: 'bars', points: pts, label: ctx.t('today'), show_range: true, tone: 'info', marker: i };
  if (cheap < pts.length) Object.assign(chart, { highlight: cheap, highlight_tone: 'good' });
  /** @type {import('kinframe').StackView} */
  const detail = { type: 'stack', items: [main, chart, { type: 'text', lines: [ctx.t('source'), ctx.t('license')] }] };
  return { main, detail };
}

/** @param {import('kinframe').Ctx} ctx */
const current = (ctx) => (ctx.state.prices ? view(ctx.state.prices, ctx) : null);

/** @type {import('kinframe').Plugin} */
export default {
  async update(ctx) {
    const r = await ctx.http.get('https://api.energy-charts.info/price?bzn=' + encodeURIComponent(ctx.settings.zone || 'BE'));
    if (r.status === 429) throw new Error('Energy-Charts: too many requests (HTTP 429), trying again at the next refresh');
    if (!r.ok) throw new Error('Energy-Charts: HTTP ' + r.status);
    const json = r.json();
    if (!/CC BY 4\.0/.test(String(json.license_info || ''))) throw new Error('Energy-Charts: these prices are not published under CC BY 4.0, so they are not shown');
    ctx.state.prices = json;
  },
  render(ctx) { const v = current(ctx); return v && v.main; },
  detail(ctx) { const v = current(ctx); return v && v.detail; },
};
