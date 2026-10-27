// @ts-check
// Up to five quotes from EODHD's real-time API (https://eodhd.com/financial-apis/live-realtime-stocks-api), as a
// `list`: the name, the price and today's change as a badge, green up and red down with an arrow (colour is never the
// only cue). In the band the list shrinks to the names and their badges.
//
// Terms: the owner brings their own EODHD key (a `secret`), which EODHD's personal plans allow for private,
// non-commercial use; nothing is sent anywhere but eodhd.com. Stocks are delayed 15–20 minutes, which the detail card
// says along with the source. The budget: every symbol costs one API call per request and the free plan has 20 a day,
// so the refreshes are spread evenly between 9:00 and 22:00 (the frame's time: Europe's and America's trading hours)
// and counted in ctx.store, so a restart doesn't spend the day's calls again. EODHD's day starts at midnight UTC.

const MAX_SYMBOLS = 5;
const FIRST_HOUR = 9, LAST_HOUR = 22;
const MIN_INTERVAL_MS = 15 * 60 * 1000;

/** Exchange suffix → currency sign (shares); FOREX and CC carry theirs in the code, INDX has none. */
const CURRENCY = {
  US: '$', BR: '€', AS: '€', PA: '€', LS: '€', MI: '€', MC: '€', XETRA: '€', F: '€', VI: '€', HE: '€', IR: '€',
  LSE: 'p', SW: 'CHF', TO: 'C$', CO: 'kr', ST: 'kr', OL: 'kr',
};
const SIGN = { USD: '$', EUR: '€', GBP: '£', CHF: 'CHF', JPY: '¥' };

/**
 * The symbols setting: "UCB.BR, GSPC.INDX=S&P 500" → [{ code: 'UCB.BR', name: 'UCB' }, …], at most five.
 * @param {unknown} raw
 * @returns {{ code: string, name: string }[]}
 */
export function parseSymbols(raw) {
  /** @type {{ code: string, name: string }[]} */
  const out = [];
  for (const part of String(raw || '').split(',')) {
    const [c, ...rest] = part.split('=');
    const code = c.trim().toUpperCase();
    if (!/^[A-Z0-9^&_-]{1,20}\.[A-Z]{1,6}$/.test(code) || out.some((s) => s.code === code)) continue;
    const name = rest.join('=').trim() || shortName(code);
    out.push({ code, name: name.slice(0, 10) });
    if (out.length === MAX_SYMBOLS) break;
  }
  return out;
}

/** @param {string} code */
function shortName(code) {
  const [base, ex] = code.split('.');
  if (ex === 'FOREX' && base.length === 6) return base.slice(0, 3) + '/' + base.slice(3);
  if (ex === 'CC') return base.split('-')[0];
  return base;
}

/** @param {string} code */
function currency(code) {
  const [base, ex] = code.split('.');
  if (ex === 'CC') { const q = base.split('-')[1] || ''; return SIGN[q] || q; }
  if (ex === 'FOREX' || ex === 'INDX') return '';
  return CURRENCY[ex] || '';
}

/** @param {number} v @param {string} code */
function decimals(v, code) {
  if (code.endsWith('.FOREX')) return 4;
  const a = Math.abs(v);
  return a >= 10000 ? 0 : a >= 1 ? 2 : 4;
}

/**
 * When the next request may go out: the day's calls spread evenly between FIRST_HOUR and LAST_HOUR, at least
 * 15 minutes apart (the data is delayed that much anyway).
 * @param {number} dailyCalls @param {number} symbols
 */
export function interval(dailyCalls, symbols) {
  const polls = Math.floor(dailyCalls / symbols);
  if (polls < 1) return Infinity;
  return Math.max(MIN_INTERVAL_MS, ((LAST_HOUR - FIRST_HOUR) * 3600 * 1000) / polls);
}

/**
 * @typedef {{ code: string, close: number, prev: number | null, change: number | null, pct: number | null, ts: number }} Quote
 * @typedef {{ symbols: string, at: number, quotes: Quote[] }} Saved
 */

/** @param {any} q @returns {Quote | null} */
function quote(q) {
  const close = typeof q.close === 'number' ? q.close : NaN;
  if (!q || typeof q.code !== 'string' || !isFinite(close)) return null;
  const num = (/** @type {any} */ v) => (typeof v === 'number' && isFinite(v) ? v : null);
  return { code: q.code.toUpperCase(), close, prev: num(q.previousClose), change: num(q.change), pct: num(q.change_p), ts: (num(q.timestamp) || 0) * 1000 };
}

/**
 * The quotes as a list; `withChange` adds the change in the price's own unit (the detail card).
 * @param {Saved} saved
 * @param {import('kinframe').Ctx} ctx
 * @param {boolean} withChange
 * @returns {import('kinframe').ListView | import('kinframe').TextView}
 */
export function board(saved, ctx, withChange) {
  const label = String(ctx.settings.label || '').trim().slice(0, 32) || ctx.t('title');
  const rows = parseSymbols(ctx.settings.symbols).map((s) => {
    const q = saved.quotes.find((x) => x.code === s.code);
    if (!q) return { time: s.name, title: ctx.t('unknown'), tone: /** @type {const} */ ('neutral') };
    const d = decimals(q.close, q.code);
    const pct = q.pct;
    const up = pct != null && pct > 0, down = pct != null && pct < 0;
    const signed = (/** @type {number} */ v, /** @type {number} */ n, /** @type {string} */ unit) =>
      (v > 0 ? '+' : v < 0 ? '−' : '') + ctx.format.number(Math.abs(v), n, unit);
    return {
      time: s.name,
      title: ctx.format.number(q.close, d, currency(q.code)),
      detail: withChange && q.change != null ? signed(q.change, d, '').slice(0, 16) : undefined,
      badge: pct != null ? signed(pct, 2, '%').slice(0, 10) : undefined,
      icon: up ? /** @type {const} */ ('arrow-up') : down ? /** @type {const} */ ('arrow-down') : undefined,
      tone: up ? /** @type {const} */ ('good') : down ? /** @type {const} */ ('bad') : undefined,
    };
  });
  if (!rows.length) return { type: 'text', lines: [ctx.t('no_symbols')], icon: 'info' };
  return { type: 'list', label, rows };
}

/** @param {import('kinframe').Ctx} ctx @returns {Saved | null} */
function saved(ctx) {
  const s = /** @type {Saved | null} */ (ctx.store.getJson('quotes'));
  return s && Array.isArray(s.quotes) ? s : null;
}

/** @param {import('kinframe').Ctx} ctx */
function utcDay(ctx) {
  return new Date(ctx.now()).toISOString().slice(0, 10);
}

/** @type {import('kinframe').Plugin} */
export default {
  async update(ctx) {
    const symbols = parseSymbols(ctx.settings.symbols);
    const key = String(ctx.settings.api_key || '').trim();
    if (!symbols.length || !key) return;
    const daily = Math.max(1, Math.floor(Number(ctx.settings.daily_calls) || 20));
    const every = interval(daily, symbols.length);
    if (every === Infinity) throw new Error(`EODHD: ${symbols.length} symbols need ${symbols.length} calls per refresh, more than the ${daily} a day set`);

    const codes = symbols.map((s) => s.code).join(',');
    const last = saved(ctx);
    const changed = !last || last.symbols !== codes;
    const now = ctx.now();
    const t = ctx.localTime(now);
    const inHours = t.hour >= FIRST_HOUR && t.hour < LAST_HOUR;
    const weekend = t.weekday >= 6 && !symbols.some((s) => s.code.endsWith('.CC'));
    if (!changed && (!inHours || weekend || now - last.at < every)) return;

    const day = utcDay(ctx);
    const used = /** @type {{ day: string, used: number } | null} */ (ctx.store.getJson('calls'));
    const spent = used && used.day === day ? used.used : 0;
    if (spent + symbols.length > daily) return; // today's calls are spent; the last quotes stay

    const [first, ...rest] = symbols.map((s) => encodeURIComponent(s.code));
    const url = `https://eodhd.com/api/real-time/${first}?${rest.length ? 's=' + rest.join(',') + '&' : ''}fmt=json&api_token=${encodeURIComponent(key)}`;
    const r = await ctx.http.get(url);
    if (r.status === 401 || r.status === 403) throw new Error(`EODHD: the API key was refused (HTTP ${r.status})`);
    if (r.status === 402) {
      ctx.store.setJson('calls', { day, used: daily });
      throw new Error("EODHD: your plan's calls for today are used up (HTTP 402)");
    }
    if (r.status === 429) throw new Error('EODHD: too many requests (HTTP 429), trying again at the next refresh');
    if (!r.ok) throw new Error('EODHD: HTTP ' + r.status);
    ctx.store.setJson('calls', { day, used: spent + symbols.length });

    const body = r.json();
    const quotes = /** @type {Quote[]} */ ((Array.isArray(body) ? body : [body]).map(quote).filter(Boolean));
    if (!quotes.length) throw new Error('EODHD: no quotes for ' + codes);
    ctx.store.setJson('quotes', { symbols: codes, at: now, quotes });
  },
  render(ctx) {
    const s = saved(ctx);
    if (!s) return null;
    ctx.dataTime = Math.max(...s.quotes.map((q) => q.ts));
    return board(s, ctx, false);
  },
  detail(ctx) {
    const s = saved(ctx);
    if (!s) return null;
    return {
      type: 'stack',
      items: [board(s, ctx, true), { type: 'text', lines: [ctx.t('source'), ctx.t('updated', { ago: ctx.format.ago(s.at) })] }],
    };
  },
};
