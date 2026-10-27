// @ts-check
// Bin day from a municipality's waste calendar (iCal). Shown only the day before and on the day itself;
// otherwise the widget hides ({type: "none"}). "Today"/"Tomorrow" come from ctx.format.day, in the frame's language.

/**
 * All-day events: { date: "2026-10-26", what: "PMD" }.
 * @param {string} text
 */
export function parseIcs(text) {
  const out = [];
  const unfolded = String(text).replace(/\r?\n[ \t]/g, '');
  for (const block of unfolded.split('BEGIN:VEVENT').slice(1)) {
    const start = /DTSTART[^:\n]*:(\d{4})(\d{2})(\d{2})/.exec(block);
    const what = /SUMMARY[^:\n]*:(.*)/.exec(block);
    if (start && what) out.push({ date: `${start[1]}-${start[2]}-${start[3]}`, what: what[1].trim().replace(/\\,/g, ',') });
  }
  return out;
}

/**
 * @param {{ date: string, what: string }[]} events
 * @param {import('kinframe').Ctx} ctx
 * @returns {import('kinframe').RootView}
 */
export function view(events, ctx) {
  const today = ctx.localTime().date;
  const tomorrow = ctx.localTime(ctx.now() + 86400000).date;
  /** @type {[string, number][]} */
  const days = [[today, ctx.now()], [tomorrow, ctx.now() + 86400000]];
  for (const [day, at] of days) {
    const bins = events.filter((e) => e.date === day).map((e) => e.what);
    if (bins.length) return { type: 'text', lines: [ctx.format.day(at), bins.join(', ').slice(0, 60)], icon: 'trash', tone: day === today ? 'accent' : undefined };
  }
  return { type: 'none' };
}

/** @type {import('kinframe').Plugin} */
export default {
  async update(ctx) {
    if (!ctx.settings.calendar_url) return;
    const r = await ctx.http.get(ctx.settings.calendar_url);
    if (!r.ok) throw new Error('calendar: HTTP ' + r.status);
    ctx.state.events = parseIcs(r.text);
  },
  render(ctx) {
    return ctx.state.events ? view(ctx.state.events, ctx) : null;
  },
};
