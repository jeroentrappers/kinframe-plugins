// The frame's network rules for ctx.http, ctx.ws and image views: a port of PluginPermissions/PluginNet.authorize
// (kinframe android/frame/.../js/PluginNet.kt) and LocalAddress (…/plugins/LocalAddress.kt).
//
// Every permission entry is a setting holding an address (`settings.base_url`) or a fixed https origin. A request is
// allowed when it goes to one of those origins (same scheme, host and port). It must stay on the home network when the
// setting is `local_only` or the URL is plain http://. The frame resolves names and requires private addresses; the kit
// can't resolve your home network, so a scenario names them in its `dns` map (host → address). Names under `.local`,
// `.lan`, `.home.arpa` and single-label names count as home without one.
import { isIPv4, isIPv6 } from 'node:net';

export class PermissionError extends Error {
  constructor(message) { super(message); this.name = 'SecurityException'; }
}

const DEFAULT_PORT = { http: 80, https: 443 };

/** Parses an http(s) URL into { scheme, host, port, path } (host lowercase, IPv6 without brackets), or null. */
export function parseHttpUrl(text) {
  let u;
  try { u = new URL(String(text)); } catch { return null; }
  const scheme = u.protocol.replace(/:$/, '').toLowerCase();
  if (scheme !== 'http' && scheme !== 'https') return null;
  if (!u.hostname) return null;
  const host = u.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  return { scheme, host, port: u.port ? Number(u.port) : DEFAULT_PORT[scheme], path: u.pathname || '/', href: u.href };
}

/**
 * LocalAddress.baseUrl: an address as typed by the owner ("192.168.1.50", "p1meter.local:80", "http://ha:8123/") as
 * an http(s) origin with path "/", or null when it isn't one.
 */
export function baseUrl(typed) {
  const t = String(typed).trim().replace(/\/+$/, '');
  if (!t || /\s/.test(t)) return null;
  const http = /^https?:\/\//i.test(t);
  if (!http && t.includes('://')) return null;
  let withScheme;
  if (http) withScheme = t;
  else if (t.includes(':') && !t.includes('.') && (t.match(/:/g) || []).length > 1) withScheme = `http://[${t}]`;
  else withScheme = `http://${t}`;
  const u = parseHttpUrl(withScheme);
  return u ? { ...u, path: '/' } : null;
}

/** The manifest's entries of one kind (`http` or `websocket`) applied to the owner's settings. */
export function grants(manifest, settings, kind = 'http') {
  const out = [];
  for (const e of manifest.permissions[kind] || []) {
    if (e.startsWith('settings.')) {
      const spec = manifest.settings.find((s) => s.key === e.slice('settings.'.length));
      const typed = spec && settings[spec.key];
      if (typed === undefined || typed === null || typeof typed === 'object') continue;
      const base = baseUrl(String(typed));
      if (base) out.push({ entry: e, base, localOnly: spec.localOnly });
    } else {
      const base = parseHttpUrl(e);
      if (base) out.push({ entry: e, base: { ...base, path: '/' }, localOnly: false });
    }
  }
  return out;
}

/** The grant that allows `url` (parsed), or null. */
export function check(url, list) {
  return list.find((g) => g.base.scheme === url.scheme && g.base.host === url.host && g.base.port === url.port &&
    url.path.startsWith(g.base.path.replace(/\/+$/, ''))) || null;
}

function v4bytes(h) { return h.split('.').map(Number); }

function v6bytes(h) {
  let s = h.split('%')[0];
  let tail = [];
  const v4 = s.match(/:(\d+\.\d+\.\d+\.\d+)$/);
  if (v4) { tail = v4bytes(v4[1]); s = s.slice(0, -v4[1].length) + '0:0'; }
  const [head, rest] = s.split('::');
  const a = head ? head.split(':') : [];
  const b = rest !== undefined && rest ? rest.split(':') : [];
  const fill = rest !== undefined ? 8 - a.length - b.length : 0;
  const words = [...a, ...Array(fill).fill('0'), ...b].map((w) => parseInt(w || '0', 16));
  const bytes = words.flatMap((w) => [w >> 8, w & 255]);
  if (tail.length) bytes.splice(12, 4, ...tail);
  return bytes;
}

function private4([a, b]) {
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254);
}

/** LocalAddress.isPrivate for an IP literal: RFC 1918, IPv4 link-local, IPv6 ULA and link-local (loopback isn't). */
export function isPrivateAddress(ip) {
  if (isIPv4(ip)) return private4(v4bytes(ip));
  if (isIPv6(ip.split('%')[0])) {
    const b = v6bytes(ip);
    if (b.slice(0, 10).every((x) => x === 0) && b[10] === 255 && b[11] === 255) return private4(b.slice(12));
    return (b[0] & 0xfe) === 0xfc || (b[0] === 0xfe && (b[1] & 0xc0) === 0x80);
  }
  return false;
}

/** LocalAddress.literalIsPrivate: true/false for an IP literal, null for a name. */
export function literalIsPrivate(host) {
  const h = host.replace(/^\[|\]$/g, '');
  const looksIp = (/^[\d.]+$/.test(h) && (h.match(/\./g) || []).length === 3) || h.includes(':');
  if (!looksIp) return null;
  return isPrivateAddress(h);
}

const HOME_SUFFIXES = ['.local', '.lan', '.home.arpa', '.internal'];

/** Whether a name would resolve to the home network, given the scenario's `dns` map. */
function nameIsHome(host, dns) {
  if (dns && Object.prototype.hasOwnProperty.call(dns, host)) {
    const addrs = [].concat(dns[host]);
    return addrs.length > 0 && addrs.every((a) => isPrivateAddress(String(a)));
  }
  return !host.includes('.') || HOME_SUFFIXES.some((s) => host.endsWith(s));
}

/**
 * PluginNet.authorize: throws PermissionError unless the manifest allows `urlText`; returns { url, grant, home }.
 * `ws: true` checks ws:// and wss:// as http:// and https:// against `permissions.websocket`.
 */
export function authorize(urlText, { manifest, settings, ws = false, dns = null }) {
  const text = ws ? String(urlText).replace(/^ws/i, 'http') : String(urlText);
  const url = parseHttpUrl(text);
  if (!url) throw new PermissionError(ws ? `not a ws(s) URL: ${urlText}` : `not an http(s) URL: ${urlText}`);
  const g = check(url, grants(manifest, settings, ws ? 'websocket' : 'http'));
  const shownHost = url.host.includes(':') ? `[${url.host}]` : url.host;
  if (!g) throw new PermissionError(`not allowed: ${url.scheme}://${shownHost}:${url.port}`);
  const home = g.localOnly || url.scheme === 'http';
  if (home) {
    const lit = literalIsPrivate(url.host);
    if (lit === false) throw new PermissionError(`${url.host} is not on the home network`);
    if (lit === null && !nameIsHome(url.host, dns)) {
      throw new PermissionError(`${url.host} is not on the home network (the frame only connects to private addresses here; name its address in the scenario's "dns" map)`);
    }
  }
  return { url, grant: g, home };
}
