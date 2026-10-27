# The plugin kit

`npm run kit -- <command>` from the repository root (or `node kit/bin/kit.mjs <command>`); the commands are in
[AUTHORING.md §18](../AUTHORING.md#18-kit-commands).

| | |
|---|---|
| `bin/kit.mjs` | the command line |
| `src/manifest.mjs` | the frame's manifest rules (port of `PluginManifest.kt`) |
| `src/net.mjs` | the http/WebSocket permission rules and `local_only` (`PluginNet.kt`, `LocalAddress.kt`) |
| `src/format.mjs` | `ctx.format` and `ctx.localTime` on Intl (`PluginFormat.kt`) |
| `src/view.mjs` | views against the schema (ajv) and the frame's validator (port of `PluginViewParser.kt`) |
| `src/sandbox.mjs` | a plugin instance in QuickJS with the frame's prelude, libraries and `__kf` bindings |
| `src/scenario.mjs` | scenarios, snapshots |
| `src/check.mjs` | `kit check` |
| `src/bundle.mjs`, `src/registry.mjs` | deterministic bundles; index, signing (§7.1) |
| `src/preview.mjs`, `preview/` | `kit preview` |
| `src/new.mjs`, `src/types.mjs`, `types/` | scaffolding and TypeScript declarations |
| `host/` | **the frame's own files**, not edited here: `prelude.js`, `lib/*.js`, `views/` (schema, types, examples), `relative-words.json`; `SOURCE` names the kinframe commit |
| `schema/` | the view schema the kit uses: upstream plus the extensions in `src/schema.mjs` (generated) |
| `sync-host.sh` | `kit/sync-host.sh <kinframe checkout>` refreshes `host/`, `types/plugin-view.d.ts` and `schema/` |
| `test/` | `npm test` |
