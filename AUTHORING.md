# Writing a kinframe plugin

From `kit new` to a merged pull request. The authority behind this guide is kinframe's
[plugin design](https://github.com/jeroentrappers/kinframe/blob/main/docs/plugins.md) (§3 manifest and code, §4 views,
§5 how it runs, §6 settings, §7 the registry, §13 the sandbox); the kit enforces the same rules the frame does.

- [1. What a plugin is](#1-what-a-plugin-is)
- [2. Start](#2-start)
- [3. The manifest](#3-the-manifest)
- [4. Permissions, and why](#4-permissions-and-why)
- [5. The code: update, render, detail](#5-the-code-update-render-detail)
- [6. ctx](#6-ctx)
- [7. Views](#7-views)
- [8. Translations](#8-translations)
- [9. The host's libraries](#9-the-hosts-libraries)
- [10. Using other people's services](#10-using-other-peoples-services)
- [11. Scenarios and tests](#11-scenarios-and-tests)
- [12. Preview](#12-preview)
- [13. Types in plain JavaScript](#13-types-in-plain-javascript)
- [14. Review and publishing](#14-review-and-publishing)
- [15. Updates and permission changes](#15-updates-and-permission-changes)
- [16. Revocation](#16-revocation)
- [17. Limits](#17-limits)
- [18. Kit commands](#18-kit-commands)

## 1. What a plugin is

A small JavaScript module that fetches something (from a device at home or a service on the internet) and returns a
**view**: plain data describing a value, a gauge, a list, a chart… The frame draws it natively, in a corner of the
photo, in the band beside it, and in a detail card when someone taps it. A plugin never draws pixels, never sees the
photos, and can only reach the addresses its manifest names.

```
plugins/community.my-plugin/
  plugin.json          the manifest: id, version, licence, settings, permissions
  main.js              the code: one ES module, default export with update/render/detail
  locales/en.json      translations of the manifest's texts and the plugin's own strings
  locales/nl.json      … one file per language
  fixtures/            real answers recorded from the service, for the scenarios (no secrets)
  scenarios/           what to run in the sandbox, and the snapshots of what came out
  README.md            what it shows, how to set it up, what it may reach and why (shown in the catalog)
```

Only `plugin.json`, `main.js` and `locales/*.json` go into the published bundle.

## 2. Start

```sh
npm ci
npm run kit -- new community.tide-times
npm run kit -- preview community.tide-times
```

`kit new` writes a plugin that already runs: a manifest with one setting and one fixed host, `main.js` with the
update/render/detail split, English and Dutch translations, a fixture, a scenario and its snapshot, and a README. `kit
check` lists the `TODO`s left. Pick an id `community.<name>`: lowercase letters, digits and `-`, unique in the registry;
the folder has the same name.

## 3. The manifest

```json
{
  "id": "community.tide-times",
  "name": "Tide times",
  "version": "1.0.0",
  "api": 1,
  "author": { "name": "Jane Doe", "url": "https://github.com/janedoe" },
  "license": "MIT",
  "description": "High and low tide at a Belgian or Dutch port, from …",
  "slots": ["top-left", "top-right"],
  "refresh": { "min_seconds": 900, "default_seconds": 1800, "stale_seconds": 7200 },
  "default_visibility": "always",
  "permissions": { "http": ["https://api.example.org"] },
  "settings": [
    { "key": "port", "type": "choice", "label": "Port", "options": ["ostend", "zeebrugge", "vlissingen"], "default": "ostend" },
    { "key": "show_heights", "type": "boolean", "label": "Show heights", "default": true }
  ]
}
```

| Field | |
|---|---|
| `id` | `community.<name>`, at most 64 characters, the folder's name. |
| `name`, `description` | Shown in the catalog (≤ 200 and ≤ 400 characters); translated as `@name`, `@description`. |
| `version` | Semver (`1.2.3`, `1.3.0-beta.1`). Raise it with every change to the bundle (§15). |
| `api` | `1`. |
| `author` | `{ "name", "url"? }`. |
| `license` | An OSI-approved SPDX id: `MIT`, `Apache-2.0`, `BSD-3-Clause`, `GPL-3.0-or-later`, `MPL-2.0`, … (or an expression such as `MIT OR Apache-2.0`). |
| `slots` | The corners it may take, default both. |
| `refresh` | `default_seconds` between updates; `min_seconds` the floor for `ctx.invalidate()` and the rate limit for the network (at least 1; below 5 only when every `http` permission is a `local_only` setting, so no internet API is asked every second by every frame); optional `stale_seconds`: how old `ctx.dataTime` may be before the view is greyed. |
| `default_visibility` | How a new instance starts: `always`, `on_change` (30 s after the view changes) or `on_tap`. |
| `presets` | Up to 12 named groups of setting values (`{ "id", "label", "settings" }`); a string may hold `{key}` placeholders for **text** settings the owner fills in first. Never secrets. |
| `permissions` | §4. |
| `settings` | The form the apps draw; plugins never ship their own settings UI. |

**Setting types** (each has `key` in snake_case, `type`, `label`, optional `help`, `placeholder`, `required`,
`default`):

| Type | The form shows | `ctx.settings.<key>` |
|---|---|---|
| `text` | a text field | string |
| `number` | a number field | number |
| `boolean` | a switch | boolean |
| `choice` | segmented control (≤ 4 options) or menu; needs `options` | one of the options |
| `url` | an address field; `local_only`, `discover` (`"_home-assistant._tcp"`) | string as typed ("192.168.1.20", "http://ha.local:8123") |
| `secret` | a password field, never shown again; kept apart from the other settings | string |
| `entity` | a Home Assistant entity picker; `domain`, `unit`, `multiple` (needs settings `base_url` and `token`) | string, or a list with `multiple` |
| `color` | `#rrggbb` | string |
| `duration` | a text field | string |
| `timezone` | a searchable list of IANA zones | string (`Asia/Tokyo`) |

A `default` must fit its type; a secret has none. Empty fields are left out of `ctx.settings`, so check before use.

## 4. Permissions, and why

The frame runs plugins written by people the owner has never met, in their living room, with the passwords of their
home devices. So a plugin can only reach what its manifest names, and the catalog shows that to the owner before they
install it.

| Permission | Means | Use it for |
|---|---|---|
| `"http": ["https://api.example.org"]` | A fixed https origin (scheme, host and port; any path). | A public API the plugin is about. Shown in the catalog. |
| `"http": ["settings.base_url"]` | Whatever address the owner typed into that `url` setting (same scheme, host and port). | A device or server of the owner's. |
| `"local_only": true` on that setting | The address must be on the home network (RFC 1918, link-local, `.local`, IPv6 ULA), checked after DNS. Plain `http://` always is. | Every device at home: a stolen token can't be sent to the internet through the plugin. |
| `"websocket": [...]` | The same, for `ctx.ws`. | Live updates (Home Assistant). |
| `"location": true` | `ctx.location`: the frame's place, rounded to about 1 km. Shown in the catalog. | Weather, air quality. Offer settings to type a place instead. |
| `"actions": true` | Buttons in the detail card that call `action(ctx, id)`. Shown in the catalog. | Media controls, a switch. |

There are no wildcards and no redirects; a plugin can't hard-code a host other than its fixed origins, and an `image`
view loads only from the same origins. Ask for as little as possible: every permission is one more thing a reviewer and
an owner have to trust, and a new version that changes `permissions` waits for each owner's approval (§15).

## 5. The code: update, render, detail

```js
// @ts-check
/** @type {import('kinframe').Plugin} */
export default {
  // Every refresh.default_seconds: fetch, keep what you need in ctx.state. The only call on a timer that may use the network.
  async update(ctx) {
    const r = await ctx.http.get('https://api.example.org/v1/tides?port=' + encodeURIComponent(ctx.settings.port));
    if (r.status === 429) throw new Error('example.org: too many requests (HTTP 429)');
    if (!r.ok) throw new Error('example.org: HTTP ' + r.status);
    ctx.state.tides = r.json().tides;
  },

  // After every update (and invalidate()): draw from ctx.state. No network here: ctx.http throws.
  render(ctx) {
    const next = ctx.state.tides?.[0];
    if (!next) return null; // nothing yet: keep the last view
    return { type: 'value', icon: 'water', tone: 'water', value: ctx.format.time(next.at), label: ctx.t(next.kind) };
  },

  // Optional: the detail card on tap. Same views, more room, and the place for the source's attribution.
  detail(ctx) { /* … */ },

  // Optional: start(ctx) when the instance starts or its settings change (open a WebSocket here),
  // action(ctx, id) for buttons (permissions.actions), stop(ctx) before it stops.
};
```

Why the split: the frame never waits for a slow network to draw. `render` and `detail` have a budget of 50 ms of
JavaScript (interrupted at 250 ms) on a frame whose CPU is 10–20× slower than a laptop's; awaiting `ctx.http` in
`update` doesn't count against it. A failed `update` skips that render and the last view stays; when `render` throws
three times in a row the widget shows "unavailable" and the owner sees your error message, so make messages useful
("example.org: HTTP 503").

Return values: a view; `null` (or nothing) keeps the last view; `{ "type": "none" }` hides the widget and frees its
place (nothing to show today).

The runtime is QuickJS: modern JavaScript (ES2023, async/await, classes, `Map`, regular expressions), but **no**
`fetch`, `XMLHttpRequest`, `WebSocket`, timers, `Intl`, file system, `eval`, `Function` or dynamic `import()`. Use
`ctx.http`, `ctx.ws`, `ctx.format` and `ctx.localTime`. `Date` works, but its time zone is the device's: use
`ctx.now()` for the frame's clock (and so the scenarios can set it) and `ctx.localTime()` for calendar dates.

## 6. ctx

| `ctx.` | What |
|---|---|
| `settings` | The owner's settings with the manifest's defaults filled in, secrets included. Read-only. |
| `state` | A plain object kept between calls (lost on restart). |
| `store` | Persistent key-value strings, 64 KB per instance: `get/set`, `getJson/setJson`; over the limit `set` throws "store full". |
| `http.get(url, options)`, `http.post(url, body, options)`, `http.put(url, body, options)` | In `start`, `update`, `action` and WebSocket handlers. Resolves to `{ status, ok, contentType, text, json() }`; a non-2xx status doesn't throw. `options.headers` (not `Host`, `Cookie`, `User-Agent`); an object body is sent as JSON. 10 s timeout, 1 MB, no redirects. |
| `ws.connect(url, { onOpen, onMessage, onClose })`, `ws.send(msg)`, `ws.close()` | One WebSocket per instance (`permissions.websocket`); the frame reconnects with backoff and calls `onOpen` again. |
| `invalidate()` | Ask for a `render` now without an `update` (after a WebSocket message); throttled to `refresh.min_seconds`. |
| `format.power(w)`, `energy(kWh)`, `volume(m³)`, `percent(v)`, `temperature(°C, decimals)`, `number(v, decimals, unit)`, `duration(s)`, `time(ms, zone?)` | In the frame's language and units: "1,2 kW", "21,4°", "2,3 m/s", "22:20". Number and unit are joined by a no-break space; the frame draws the unit smaller and one or two decimals raised. |
| `format.day(ms)`, `ago(ms)`, `until(ms)` | "Tomorrow", "Friday", "12 Nov"; "8 min ago"; "in 5 min", in the frame's own words for every language. |
| `t(key, vars)` | Your strings from `locales/` with `{name}` placeholders. |
| `log(...)` | To the frame's diagnostics, visible to the owner. Never log secrets. |
| `now()`, `timezone`, `language` | The frame's clock (epoch ms), IANA zone and language tag. |
| `localTime(ms?, zone?)` | `{ date: "2026-10-25", year, month, day, hour, minute, weekday (1 = Monday), offset_minutes, zone }`. |
| `location` | `{ latitude, longitude }`, two decimals, with `permissions.location`; else null. |
| `dataTime` | Set it to when the source measured what you show (epoch ms); the view greys after `refresh.stale_seconds`. |

## 7. Views

A view is a small tree of components. The exact format is the schema in `kit/schema/plugin-view.schema.json` (the
frame's, plus a few rules its validator enforces) and the types in `kit/types/plugin-view.d.ts`; examples of every
component are in `kit/host/views/examples/` (`npm run kit -- preview`, then "(every view type)").

| Component | Shows | Main limits |
|---|---|---|
| `value` | icon, big value, unit, label, trend arrow | value ≤ 16, unit ≤ 8, label ≤ 32 |
| `rows` | 1–4 `value`s stacked | |
| `gauge` | ring or bar 0–100 %, or a two-sided `dial` −100–100 %, label inside, up to 3 `sub` values | label ≤ 12 |
| `flow` | 2–5 nodes with animated arrows (up to 8 edges, `power` ≥ 0 from → to), a node `percent` ring | node texts ≤ 16 |
| `sparkline` | 2–100 points (`null` = gap), `line` or `bars`, `highlight` and "now" `marker` indexes, `show_range` | |
| `text` | 1–2 lines | ≤ 60 each |
| `list` | 1–5 rows of `time`, `title`, `detail`, `badge` | title ≤ 40, time ≤ 10, detail ≤ 16, badge ≤ 10 |
| `stack` | 1–4 components, vertical or horizontal | at most 3 levels deep |
| `image` | a picture from an http(s) URL your permissions allow | |
| `actions` | 1–5 buttons, detail card only (`permissions.actions`) | label ≤ 16 |
| `progress` | a bar or marker from `min` to `max`, can run on by itself | |
| `none` | hide the widget (only as the whole view) | |

Every component takes a `tone`: `neutral`, `good`, `warn`, `bad`, `accent`, `info`, or the quantity tones `water`,
`gas`, `heat` (pair them with their icon: colour is never the only cue). Icons come from a fixed set of 51 line
icons (`bolt`, `sun`, `home`, `water`, `train`, `trash`, `euro`, …: the `icon` enum in the schema). A view has at most
24 components and 16 KB; texts have no line breaks; unknown properties are refused, so a typo fails in the kit
instead of being ignored on the frame.

The same view is drawn in four forms, so design for the smallest:

- **corner** on the photo: light text with a shadow; a list shows its label and 3 rows;
- **band column**, about 80 px wide: icons and numbers stacked; a list shows only its times and short badges;
- **band strip**: one line; a stack goes horizontal; a list shows 2 rows;
- **detail card** on paper, on tap: the most room; buttons are drawn only here.

```js
// A value with a trend:
{ type: 'value', icon: 'bolt', value: ctx.format.power(1234), label: 'Using', trend: 'up' }
// A list (departures, bin days):
{ type: 'list', label: 'Denderleeuw', rows: [{ time: '22:20', title: 'Brussels Airport', detail: 'spoor 2', badge: '+3', icon: 'train', tone: 'warn' }] }
// Bars with "now" and the cheapest quarter hour:
{ type: 'sparkline', style: 'bars', points, marker: now, highlight: cheapest, highlight_tone: 'good', label: ctx.t('today'), show_range: true }
// The detail card: the main view, more of it, and the source:
{ type: 'stack', items: [main, chart, { type: 'text', lines: [ctx.t('source'), ctx.t('license')] }] }
```

## 8. Translations

`locales/<tag>.json` (`en.json`, `nl.json`, `zh-CN.json`) are flat maps of strings. Two kinds of keys:

- **The manifest's texts**, for the apps' forms and the catalog: `@name`, `@description`, `@setting.<key>`,
  `@setting.<key>.help`, `@setting.<key>.placeholder`, `@option.<key>.<value>` (a choice's options, also in English:
  `"@option.zone.BE": "Belgium"`), `@preset.<id>`. The manifest's own text is the fallback. `kit check` refuses a key
  that names no setting, option or preset.
- **Your own strings** for `ctx.t('key', { n: 3 })`: `"platform": "spoor {n}"`.

`ctx.t` looks in the frame's exact language tag, then its language, then English, then returns the key itself, so
always ship `en.json` with every key; `kit check` warns about keys `main.js` uses that `en.json` lacks, and about keys a
language misses. The registry asks for English and at least one other language. Numbers, dates and units come from
`ctx.format`, never from your strings.

## 9. The host's libraries

The frame ships a few ES modules a plugin may import (and nothing else):

```js
import * as ha from 'kinframe/ha';                 // a Home Assistant connection: subscribe, refresh, entities, callService
import { data, number } from 'kinframe/homewizard'; // a HomeWizard device's local API
import { dayTotals } from 'kinframe/day';           // "how much today" from a meter's running total, kept in ctx.store
import { series } from 'kinframe/series';           // a live value's last hour: trend arrows and sparklines
```

They run inside your plugin with your permissions and count against your budget. Their code is in `kit/host/lib/`
(the frame's own files) with types in `kit/types/lib/`; kinframe's design §13.1 documents them. Within API 1 they only
grow. Any other import (`./util.js`, a package, a URL) fails, so a plugin is one file.

## 10. Using other people's services

Most plugins show data from someone else's service. It has to be allowed, and it has to stay polite: thousands of
frames each make the requests your plugin makes.

- **Read the terms first.** The service must allow access by third-party software, and by the kind of use a family
  photo frame is. Some APIs are for "private and internal use" only, or forbid commercial use, or require a contract:
  don't use those, unless you have written permission, which you then describe in the plugin's README. Data licences
  matter too: the electricity price plugin only offers the market zones Energy-Charts publishes under CC BY 4.0, and
  refuses an answer under any other licence.
- **Attribution in the detail view.** When the terms or the data's licence ask for credit (CC BY does), show it as a
  line of text in the detail card, translated, for example
  `{ type: 'text', lines: ['Data: Open-Meteo.com', 'CAMS European air quality forecasts (Copernicus)'] }`, and credit
  the source in the README. The corner and the band are too small for it; the card is where people look.
- **Rate limits.** Set `refresh.default_seconds` to how often the data actually changes (prices once a day, departures
  every minute) and `refresh.min_seconds` to the service's limit or above; make one request per update where you can.
  The frame enforces `min_seconds`. On `429 Too Many Requests` throw a clear error ("too many requests (HTTP 429)")
  and let the next refresh try again; don't loop.
- **Identification.** The frame sends its own `User-Agent: kinframe-frame/<version>` with every request, so a service
  can tell kinframe frames apart and reach the project; a plugin can't change it (or `Host` or `Cookie`). If a
  service asks for an API key per user, make it a `secret` setting the owner fills in; never put your own key in the
  code, since the bundle is public.
- **Privacy.** Send the service only what the feature needs (a place rounded to 1 km, not an address), and never an
  owner's secret to anyone but the service it belongs to.

[PUBLISHING.md](PUBLISHING.md) makes these the terms of publication; the pull request checklist asks about them.

## 11. Scenarios and tests

A scenario runs your plugin in the kit's sandbox (QuickJS with the frame's own prelude and libraries, and the frame's
permission rules) against recorded answers, step by step; every view is checked against the schema and the frame's
validator, and the outcome is compared with a snapshot.

```json
{
  "description": "The next three trains from Denderleeuw in Dutch.",
  "language": "nl",
  "now": "2026-10-25T21:24:46Z",
  "timezone": "Europe/Brussels",
  "settings": { "station": "Denderleeuw", "count": 3 },
  "secrets": { "token": "test-token" },
  "location": { "latitude": 50.89, "longitude": 4.07 },
  "dns": { "ha.example.lan": "192.168.1.5" },
  "store": { "day": "2026-10-25|13779.3" },
  "http": [
    { "url": "https://api.irail.be/v1/liveboard/?station=Denderleeuw&format=json&arrdep=departure&lang=nl",
      "bodyFile": "fixtures/liveboard-denderleeuw.json" },
    { "method": "POST", "urlPattern": "^http://192\\.168\\.1\\.5:8123/api/", "status": 200, "body": { "ok": true } },
    { "url": "https://api.example.org/down", "status": 503, "body": "down" }
  ],
  "steps": ["start", "update", "render", "detail"]
}
```

| Key | |
|---|---|
| `settings`, `secrets` | The owner's settings; secrets apart (placeholders only). Checked against the manifest. |
| `now`, `timezone`, `language`, `h24`, `temperature_unit` | The frame's clock (ISO or epoch ms), zone, language, clock and °C/°F. Defaults: 2026-10-25T10:00:00Z, Europe/Brussels, en. |
| `location` | The frame's place (only visible with `permissions.location`). |
| `dns` | Host names that must resolve to the home network (`local_only` or plain http); `.local`, `.lan`, `.home.arpa` and single-label names count as home without it. |
| `store` | `ctx.store` at the start. |
| `http` | Stubs: `method` (default GET), `url` (exact) or `urlPattern` (a regular expression), `status` (200), `body` (string or JSON) or `bodyFile` (relative to the plugin), `contentType`, or `error` to fail the request. First match wins; a request without a stub fails the call. Permissions are checked before the stubs, as on the frame. |
| `steps` | Default `["start", "update", "render", "detail"]`. Also `"stop"`, `{ "call": "update", "expect_error": "HTTP 503" }`, `{ "advance": 60000 }` (move the clock), `{ "action": "next" }`, `{ "ws": "open" }`, `{ "ws": "message", "data": {…} }`, `{ "ws": "close" }`. |
| `timeout_ms` | The hard wall-clock limit per call (default 2000). |

```sh
npm run kit -- test community.my-plugin            # compare with scenarios/<name>.snap.json
npm run kit -- test community.my-plugin --update   # write the snapshots; review them in git diff
```

The snapshot records per step the requests made, the view returned, errors and logs, plus the store and `dataTime` at
the end. A call that fails without `expect_error`, an invalid view, a request without a stub, and a difference with
the snapshot all fail the test. Warnings: an image your permissions don't allow, a stub never used, a call that took
more than 15 ms here (the frame is 10–20× slower).

Good scenarios: the normal case from a real recorded answer; the empty state (nothing today, no trains); an error
answer (`expect_error`); and the languages you translated. Record fixtures from the real service once, then remove
tokens, account ids, addresses and other personal data; `kit check` refuses anything that looks like a secret.

## 12. Preview

```sh
npm run kit -- preview community.my-plugin   # http://127.0.0.1:8770
```

Runs the scenarios and draws each view in the frame's four forms, on light or dark paper, with the frame's sizes and
colours (an approximation, not pixel parity). It refreshes when you save. "(every view type)" shows the schema's
examples. The JSON under each scenario is what the plugin returned.

## 13. Types in plain JavaScript

`// @ts-check` at the top of `main.js` and `/** @type {import('kinframe').Plugin} */` above `export default` give
completion and type errors in VS Code and other editors: the repository's `jsconfig.json` maps `kinframe` to
`kit/types/kinframe.d.ts` (ctx, Plugin, all views) and `kinframe/ha` etc. to the libraries' types. Annotate helpers
that build views with `@returns {import('kinframe').ListView}` and the like, so `type: 'list'` isn't widened to a
string. From the command line: `npx -p typescript tsc -p jsconfig.json`. Developing outside this repository:
`npm run kit -- types --out <dir>`.

## 14. Review and publishing

1. `npm run kit -- check <id>` and `npm run kit -- test <id>` pass; the snapshots are committed.
2. Open a pull request (one plugin), fill in the checklist, sign off every commit (`git commit -s`, see
   [CONTRIBUTING.md](CONTRIBUTING.md)).
3. CI runs the kit's tests, `kit check`, every scenario, checks the sign-off, and builds the bundles to make sure no
   published version would change.
4. A maintainer reviews the code, and by hand every permission and host, the licence, the fixtures and the terms of
   the services you call.
5. On merge, CI builds `<id>-<version>.zip` for each version not yet published, writes `index.json` (sequence + 1),
   signs it with the registry key and uploads them to the release `registry`. The kinframe server picks it up within
   the hour; owners then find your plugin in the app's catalog.

`kit check` in short: the frame's manifest rules; `id` = folder, `community.` prefix, semver, an OSI licence, author
and description; translation keys naming real settings, options and presets; no `eval`, `Function`, dynamic `import()`,
`require` or imports other than `kinframe/*`; no minified code (lines over 300 characters); `main.js` ≤ 256 KB, the
bundle ≤ 512 KB and ≤ 1 MB unpacked; no secrets in fixtures and scenarios; a README; no `TODO` left.

## 15. Updates and permission changes

Raise `version` for every change to `plugin.json`, `main.js` or `locales/`: a published bundle is never replaced
(CI refuses it) and versions only go up. On frames:

- an update with the **same permissions** runs at once;
- an update that **changes `permissions`** (a new host, `location`, `actions`) waits until the owner approves it in the
  app; until then the frame keeps running the version it has. Mention it in the pull request and the README, and keep
  such changes rare.

Settings: renaming or removing a setting loses what owners filled in; add new settings with a `default` or make them
optional. `ctx.store` survives updates; keep its format readable by the next version.

## 16. Revocation

A version that misbehaves (sends data where it shouldn't, breaks a service's terms, crashes) is withdrawn by listing it
in [`registry/revoked.json`](registry/revoked.json) with a reason; only maintainers merge that. Frames stop a revoked
version and fall back to the newest earlier version with the same permissions, or report the instance as withdrawn.
A revocation can't be undone; publish a fixed version instead.

## 17. Limits

| | |
|---|---|
| Heap | 8 MB per instance |
| JavaScript per call | 50 ms target, interrupted at 250 ms (1 s at start and until the first render); time awaiting `ctx.http` doesn't count |
| Wall clock per call | 10 s (the kit: 2 s, `timeout_ms`) |
| `ctx.http` | 10 s, 1 MB per response, no redirects, rate-limited to `refresh.min_seconds` |
| `ctx.store` | 64 KB per instance |
| Images | 768 KB |
| View | 24 components, 3 levels, 16 KB |
| `main.js` | 256 KB; bundle 512 KB, 1 MB unpacked |

## 18. Kit commands

```
npm run kit -- new <id>                       scaffold plugins/<id>
npm run kit -- check [id…]                    the review rules
npm run kit -- test [id…] [--update]          scenarios against snapshots
npm run kit -- preview [id] [--port 8770]     the preview page
npm run kit -- build [id…] [--out dist]       bundles as published
npm run kit -- index --previous <index.json|none> [--out dist]
npm run kit -- sign [--key <pem>] dist/index.json         (or REGISTRY_PRIVATE_KEY)
npm run kit -- verify --key registry/public-key.b64 dist/index.json
npm run kit -- keygen [--out dir]             a throwaway key pair to try signing
npm run kit -- types [--out dir]              type checking setup
npm test                                      the kit's own tests
```
