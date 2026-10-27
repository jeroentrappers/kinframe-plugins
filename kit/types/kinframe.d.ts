// kinframe plugin API 1: the `ctx` a plugin gets and what it exports (kinframe docs/plugins.md §3.2). Views are in
// plugin-view.d.ts (the frame's own file, copied by kit/sync-host.sh). In plain JavaScript:
//
//   // @ts-check
//   /** @type {import('kinframe').Plugin} */
//   export default { async update(ctx) { … }, render(ctx) { … } };
//
// The repository's jsconfig.json maps 'kinframe' and 'kinframe/*' here; `kit types --out <dir>` copies these files.

import type { RootView, PluginView } from './plugin-view';
export * from './plugin-view';

/** What ctx.http resolves to. A non-2xx status doesn't throw: the plugin decides. */
export interface HttpResponse {
  status: number;
  /** status is 200–299 */
  ok: boolean;
  contentType: string | null;
  /** The body as text (at most 1 MB). */
  text: string;
  /** The body parsed as JSON (throws when it isn't). */
  json<T = any>(): T;
}

export interface HttpOptions {
  /** Not Host, Cookie or User-Agent (the frame sends kinframe-frame/<version>). */
  headers?: Record<string, string>;
  /** For post/put: the body's type; an object body is sent as application/json. */
  contentType?: string;
}

/**
 * Fetch, in start, update, action and WebSocket handlers (render and detail throw). Only URLs your
 * `permissions.http` allow; 10 s timeout, 1 MB response limit, no redirects.
 */
export interface Http {
  get(url: string, options?: HttpOptions): Promise<HttpResponse>;
  post(url: string, body?: unknown, options?: HttpOptions): Promise<HttpResponse>;
  put(url: string, body?: unknown, options?: HttpOptions): Promise<HttpResponse>;
}

export interface WebSocketHandlers {
  onOpen?(ws: Ws): void | Promise<void>;
  /** A JSON message arrives parsed; anything else as text. */
  onMessage?(ws: Ws, message: any): void | Promise<void>;
  onClose?(ws: Ws, reason: string): void | Promise<void>;
}

/** One WebSocket per instance, same rules as http (`permissions.websocket`); the frame reconnects with backoff. */
export interface Ws {
  connect(url: string, handlers: WebSocketHandlers): void;
  /** An object is sent as JSON. */
  send(message: unknown): void;
  close(): void;
}

/** Small persistent storage, 64 KB per instance (keys and values together); over it, set throws "store full". */
export interface Store {
  get(key: string): string | null;
  set(key: string, value: string | null): void;
  getJson<T = any>(key: string): T | null;
  setJson(key: string, value: unknown): void;
}

/** Numbers and times in the frame's language, units and time zone; number and unit joined by a no-break space. */
export interface Format {
  /** Watts: "850 W", "1,2 kW", "12 kW", "1,5 MW". */
  power(watts: number): string;
  /** kWh: "450 Wh", "3,45 kWh", "12,3 kWh", "1.234 kWh". */
  energy(kwh: number): string;
  /** m³: "1,23 m³", "12,3 m³". */
  volume(m3: number): string;
  /** 0–100: "68%" (localised). */
  percent(value: number): string;
  /** Celsius in, the frame's unit out: "12°", or "12,8°" with decimals 1. */
  temperature(celsius: number, decimals?: number): string;
  /** Anything else: number(2.345, 1, 'm/s') → "2,3 m/s". */
  number(value: number, decimals?: number, unit?: string): string;
  /** Seconds: "45 s", "12 min", "2 h 15 min". */
  duration(seconds: number): string;
  /** Clock time: "23:10" (or "11:10 PM"), in the frame's zone or `zone` (IANA). */
  time(epochMs: number, zone?: string): string;
  /** "Today", "Tomorrow", "Yesterday", a weekday within six days, else "12 Nov". */
  day(epochMs: number): string;
  /** "just now", "8 min ago", "3 h ago", then day(). */
  ago(epochMs: number): string;
  /** "now", "in 5 min", "in 3 h", then day(). */
  until(epochMs: number): string;
}

/** ctx.localTime(): the calendar for an instant in the frame's (or a named) time zone. */
export interface LocalTime {
  /** "2026-10-25" */
  date: string;
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  /** 1 = Monday … 7 = Sunday */
  weekday: number;
  /** Offset from UTC in minutes. */
  offset_minutes: number;
  zone: string;
}

/** The plugin's whole world (kinframe docs/plugins.md §3.2). */
export interface Ctx<S extends Record<string, any> = Record<string, any>, St extends Record<string, any> = Record<string, any>> {
  /** The owner's settings, secrets included, with the manifest's defaults filled in. Read-only. */
  readonly settings: Readonly<S>;
  /** Kept between calls (lost on restart). Keep what update fetched here for render. */
  state: St;
  readonly store: Store;
  readonly http: Http;
  readonly ws: Ws;
  /** Ask for a render now, without an update; throttled to refresh.min_seconds. */
  invalidate(): void;
  readonly format: Format;
  /** When the source measured what the view shows (epoch ms); greyed after refresh.stale_seconds. */
  dataTime: number | null;
  /** The plugin's own strings from locales/ ("{name}" placeholders filled from vars). */
  t(key: string, vars?: Record<string, unknown>): string;
  /** To the frame's diagnostics, visible to the owner. */
  log(...args: unknown[]): void;
  /** The frame's clock (epoch ms). Use it instead of Date.now(). */
  now(): number;
  /** The frame's IANA time zone. */
  readonly timezone: string;
  /** The frame's language tag ("nl", "zh-CN"). */
  readonly language: string;
  /** The frame's place, two decimals; null without permissions.location or when the frame has none. */
  readonly location: Readonly<{ latitude: number; longitude: number }> | null;
  /** The calendar for an instant (default now), in the frame's zone or `zone`; an unknown zone throws. */
  localTime(epochMs?: number, zone?: string): LocalTime;
}

type Returns<T> = T | Promise<T>;

/** What main.js exports by default. render and detail can't use the network; update keeps data in ctx.state. */
export interface Plugin<C extends Ctx = Ctx> {
  /** Once, when the instance starts or its settings change. The first view, or null while loading. */
  start?(ctx: C): Returns<RootView | null | void>;
  /** Every refresh.default_seconds, right before render: fetch and keep the data in ctx.state. */
  update?(ctx: C): Returns<void>;
  /** After every update and invalidate(). Draw from ctx.state; null keeps the last view, { type: 'none' } hides. */
  render(ctx: C): Returns<RootView | null | void>;
  /** The detail card on tap: same views, more room. */
  detail?(ctx: C): Returns<RootView | null | void>;
  /** A button in the detail card was pressed (needs permissions.actions). May return a view to show at once. */
  action?(ctx: C, id: string): Returns<RootView | null | void>;
  /** Before the instance stops. */
  stop?(ctx: C): Returns<void>;
}

export type { RootView, PluginView };
