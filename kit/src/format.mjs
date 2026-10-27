// ctx.format.* and ctx.localTime as the frame computes them: a port of PluginFormat (kinframe android/core/.../plugin/
// PluginFormat.kt) on Node's Intl instead of java.text. Numbers round half-even and always group, like Java's
// NumberFormat; number and unit are joined with a no-break space. Differences that remain are cosmetic: a short date
// may differ in a dot ("27 okt" here, "27 okt." on the frame), and a few locales' minus or percent signs.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { HOST_DIR } from './paths.mjs';

export const NBSP = ' ';

let WORDS;
function allWords() {
  if (!WORDS) WORDS = JSON.parse(readFileSync(join(HOST_DIR, 'relative-words.json'), 'utf8'));
  return WORDS;
}

/** The frame's words for day/ago/until in a language tag: the exact tag, then its language, then English. */
export function relativeWords(tag) {
  const w = allWords();
  const exact = Object.keys(w).find((k) => k && k.toLowerCase() === tag.toLowerCase());
  const lang = tag.split('-')[0].toLowerCase();
  return { ...w[''], ...(w[exact ?? (lang in w ? lang : '')] || {}) };
}

/** A canonical BCP 47 tag ("nl", "zh-CN"); throws on nonsense. */
export function canonicalTag(tag) {
  return Intl.getCanonicalLocales(tag)[0];
}

/** Throws the frame's error for an unknown IANA zone. */
export function checkZone(zone) {
  try { new Intl.DateTimeFormat('en', { timeZone: zone }); } catch { throw new Error(`unknown time zone: ${zone}`); }
  return zone;
}

const partsCache = new Map();
function zoneFormatter(zone) {
  let f = partsCache.get(zone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric', weekday: 'short' });
    partsCache.set(zone, f);
  }
  return f;
}

const WEEKDAYS = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
const pad = (n, w = 2) => String(n).padStart(w, '0');

/** ctx.localTime(epochMs, zone): { date, year, month, day, hour, minute, weekday (1 = Monday), offset_minutes, zone }. */
export function localTime(ms, zone) {
  checkZone(zone);
  const p = Object.fromEntries(zoneFormatter(zone).formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  const year = +p.year, month = +p.month, day = +p.day, hour = +p.hour % 24, minute = +p.minute, second = +p.second;
  const asUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  const offset = Math.round((asUtc - (Math.floor(ms / 1000) * 1000)) / 60000);
  return { date: `${pad(year, 4)}-${pad(month)}-${pad(day)}`, year, month, day, hour, minute, weekday: WEEKDAYS[p.weekday], offset_minutes: offset, zone };
}

const dayNumber = (lt) => Math.floor(Date.UTC(lt.year, lt.month - 1, lt.day) / 86400000);

export class PluginFormat {
  /**
   * @param {object} o
   * @param {string} o.language  BCP 47 tag ("nl")
   * @param {string} o.zone      IANA zone ("Europe/Brussels")
   * @param {boolean} [o.h24]    24-hour clock (default true)
   * @param {'c'|'f'} [o.temperatureUnit]
   */
  constructor({ language = 'en', zone = 'Europe/Brussels', h24 = true, temperatureUnit = 'c' } = {}) {
    this.locale = canonicalTag(language);
    this.zone = checkZone(zone);
    this.h24 = h24;
    this.temperatureUnit = temperatureUnit;
    this.words = relativeWords(this.locale);
    this.nf = new Map();
  }

  num(v, decimals) {
    let f = this.nf.get(decimals);
    if (!f) {
      f = new Intl.NumberFormat(this.locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals, useGrouping: 'always', roundingMode: 'halfEven' });
      this.nf.set(decimals, f);
    }
    // "-0" reads as noise on a meter that hovers around zero.
    const r = Math.abs(v) < 0.5 * Math.pow(10, -decimals) ? 0 : v;
    return f.format(r);
  }

  join(n, unit) { return n + NBSP + unit; }

  power(w) {
    const a = Math.abs(w);
    if (a < 999.5) return this.join(this.num(w, 0), 'W');
    if (a < 9950) return this.join(this.num(w / 1000, 1), 'kW');
    if (a < 999500) return this.join(this.num(w / 1000, 0), 'kW');
    return this.join(this.num(w / 1e6, 1), 'MW');
  }

  energy(kwh) {
    const a = Math.abs(kwh);
    if (a < 0.9995) return this.join(this.num(kwh * 1000, 0), 'Wh');
    if (a < 9.995) return this.join(this.num(kwh, 2), 'kWh');
    if (a < 99.95) return this.join(this.num(kwh, 1), 'kWh');
    if (a < 99999.5) return this.join(this.num(kwh, 0), 'kWh');
    return this.join(this.num(kwh / 1000, 0), 'MWh');
  }

  volume(m3) {
    const a = Math.abs(m3);
    return this.join(this.num(m3, a < 9.995 ? 2 : a < 99.95 ? 1 : 0), 'm³');
  }

  percent(v) {
    return new Intl.NumberFormat(this.locale, { style: 'percent', maximumFractionDigits: 0, roundingMode: 'halfEven' }).format(v / 100);
  }

  temperature(c, decimals = 0) {
    const d = Math.min(3, Math.max(0, decimals | 0));
    return this.num(this.temperatureUnit.toLowerCase() === 'f' ? (c * 9) / 5 + 32 : c, d) + '°';
  }

  number(v, decimals = 0, unit = null) {
    const n = this.num(v, Math.min(6, Math.max(0, decimals | 0)));
    return unit ? this.join(n, unit) : n;
  }

  duration(seconds) {
    const s = Math.max(0, Math.trunc(seconds));
    if (s < 60) return this.join(this.num(s, 0), 's');
    if (s < 3600) return this.join(this.num(Math.floor(s / 60), 0), 'min');
    return this.join(this.num(Math.floor(s / 3600), 0), 'h') + ' ' + this.join(this.num(Math.floor((s % 3600) / 60), 0), 'min');
  }

  time(ms, zone = this.zone) {
    const lt = localTime(ms, zone);
    if (this.h24) return `${pad(lt.hour)}:${pad(lt.minute)}`;
    const period = new Intl.DateTimeFormat(this.locale, { hour: 'numeric', hourCycle: 'h12', timeZone: zone }).formatToParts(new Date(ms)).find((p) => p.type === 'dayPeriod');
    return `${lt.hour % 12 === 0 ? 12 : lt.hour % 12}:${pad(lt.minute)} ${period ? period.value : lt.hour < 12 ? 'AM' : 'PM'}`;
  }

  day(ms, now) {
    const days = dayNumber(localTime(ms, this.zone)) - dayNumber(localTime(now, this.zone));
    if (days === 0) return this.words.today;
    if (days === 1) return this.words.tomorrow;
    if (days === -1) return this.words.yesterday;
    if (Math.abs(days) <= 6) {
      const w = new Intl.DateTimeFormat(this.locale, { weekday: 'long', timeZone: this.zone }).format(new Date(ms));
      return w.charAt(0).toLocaleUpperCase(this.locale) + w.slice(1);
    }
    return new Intl.DateTimeFormat(this.locale, { day: 'numeric', month: 'short', timeZone: this.zone }).format(new Date(ms));
  }

  ago(ms, now) {
    const s = Math.trunc((now - ms) / 1000);
    const sameDay = localTime(ms, this.zone).date === localTime(now, this.zone).date;
    if (s < 60) return this.words.justNow;
    if (s < 3600) return this.words.minutesAgo.replace('{n}', this.num(Math.floor(s / 60), 0));
    if ((s < 86400 && sameDay) || s < 6 * 3600) return this.words.hoursAgo.replace('{n}', this.num(Math.floor(s / 3600), 0));
    return this.day(ms, now);
  }

  until(ms, now) {
    const s = Math.trunc((ms - now) / 1000);
    const sameDay = localTime(ms, this.zone).date === localTime(now, this.zone).date;
    if (s < 30) return this.words.now;
    if (s < 3600) return this.words.inMinutes.replace('{n}', this.num(Math.min(59, Math.floor((s + 59) / 60)), 0));
    if ((s < 86400 && sameDay) || s < 6 * 3600) return this.words.inHours.replace('{n}', this.num(Math.round(s / 3600), 0));
    return this.day(ms, now);
  }

  /** The `__kf.fmt(kind, …)` binding the prelude calls. */
  call(kind, a1, a2, a3, now) {
    const d = (v) => (typeof v === 'number' ? v : NaN);
    switch (kind) {
      case 'power': return this.power(d(a1));
      case 'energy': return this.energy(d(a1));
      case 'volume': return this.volume(d(a1));
      case 'percent': return this.percent(d(a1));
      case 'temperature': return this.temperature(d(a1), Math.min(3, Math.max(0, a2 | 0)));
      case 'number': return this.number(d(a1), Math.min(6, Math.max(0, a2 | 0)), typeof a3 === 'string' ? a3 : null);
      case 'duration': return this.duration(Math.trunc(d(a1)) || 0);
      case 'time': return this.time(Math.trunc(d(a1)), typeof a2 === 'string' ? checkZone(a2) : this.zone);
      case 'day': return this.day(Math.trunc(d(a1)), now);
      case 'ago': return this.ago(Math.trunc(d(a1)), now);
      case 'until': return this.until(Math.trunc(d(a1)), now);
      default: throw new Error(`format.${kind}`);
    }
  }
}
