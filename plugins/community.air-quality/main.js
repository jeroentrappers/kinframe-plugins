// @ts-check
// The European Air Quality Index (EAQI) from Open-Meteo, where the frame is (ctx.location, which needs
// `permissions.location`), or at the latitude and longitude the owner typed in instead.
//
// Terms: Open-Meteo's free API is for non-commercial use with attribution (CC BY 4.0); the detail card credits it and
// CAMS (Copernicus), and the plugin asks every 30 minutes at most, far below its daily limit.

/** @type {[number, string, import('kinframe').Tone][]} */
const LEVELS = [[20, 'good', 'good'], [40, 'fair', 'good'], [60, 'moderate', 'warn'], [80, 'poor', 'warn'], [100, 'very_poor', 'bad'], [Infinity, 'extreme', 'bad']];

/**
 * The gauge for an Open-Meteo answer, or null without an index.
 * @param {any} json
 * @param {import('kinframe').Ctx} ctx
 * @returns {import('kinframe').GaugeView | null}
 */
export function view(json, ctx) {
  const c = json.current || {};
  const aqi = c.european_aqi;
  if (typeof aqi !== 'number') return null;
  const [, key, tone] = LEVELS.find(([max]) => aqi <= max);
  return {
    type: 'gauge', value: Math.min(100, aqi), label: String(Math.round(aqi)), icon: 'wind', tone,
    caption: ctx.t(key) + ' · PM2.5 ' + ctx.format.number(c.pm2_5, 0, 'µg/m³'),
  };
}

/** Where to measure: the place the owner typed in, else the frame's own (coarse) place, else null. */
/** @param {import('kinframe').Ctx} ctx */
export function place(ctx) {
  const s = ctx.settings;
  if (typeof s.latitude === 'number' && typeof s.longitude === 'number') return { latitude: s.latitude, longitude: s.longitude };
  return ctx.location;
}

/** @type {import('kinframe').Plugin} */
export default {
  async update(ctx) {
    const p = place(ctx);
    if (!p) return;
    const { latitude, longitude } = p;
    const r = await ctx.http.get(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${latitude}&longitude=${longitude}&current=european_aqi,pm2_5,pm10`);
    if (!r.ok) throw new Error('Open-Meteo: HTTP ' + r.status);
    ctx.state.data = r.json();
  },
  render(ctx) {
    return ctx.state.data ? view(ctx.state.data, ctx) : null;
  },
  detail(ctx) {
    const g = ctx.state.data ? view(ctx.state.data, ctx) : null;
    return g && { type: 'stack', items: [g, { type: 'text', lines: [ctx.t('source'), ctx.t('model')] }] };
  },
};
