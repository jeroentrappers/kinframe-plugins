# kinframe community plugins

Plugins for [kinframe](https://github.com/jeroentrappers/kinframe), the open-source family photo frame: small widgets
in a corner of the photo or in the band beside it (air quality, bin day, train departures, the electricity price, …),
written in JavaScript by anyone, reviewed here, and delivered signed to every frame.

This repository holds:

| | |
|---|---|
| [`plugins/`](plugins/) | One folder per plugin: `plugin.json`, `main.js`, `locales/`, `fixtures/`, `scenarios/`, `README.md` |
| [`kit/`](kit/) | The plugin kit: scaffold, check, test in the frame's own sandbox, preview, build, index and sign |
| [`registry/`](registry/) | The registry's public key and the list of withdrawn (revoked) versions |
| [`AUTHORING.md`](AUTHORING.md) | How to write a plugin, from `kit new` to a merged pull request |
| [`CONTRIBUTING.md`](CONTRIBUTING.md), [`PUBLISHING.md`](PUBLISHING.md), [`DCO.md`](DCO.md) | How to contribute, the terms for publishing, the sign-off |

## How frames get plugins

1. A plugin is added or updated by pull request. CI runs the kit on it (the manifest rules the frame applies, forbidden
   code, translations, size limits, no secrets in fixtures, and every scenario in the same QuickJS sandbox the frame
   uses, with each view checked against the view schema). A maintainer reviews every new plugin and every change to
   its permissions.
2. On every merge to `main`, CI builds a bundle (`<id>-<version>.zip`) for each version not yet published, writes the
   next `index.json` and signs it (ECDSA P-256), and uploads them to the GitHub release
   [`registry`](https://github.com/jeroentrappers/kinframe-plugins/releases/tag/registry). Published bundles are never
   replaced; a version is withdrawn by listing it in [`registry/revoked.json`](registry/revoked.json).
3. The kinframe server mirrors the index and the bundles, checking the signature and every bundle's sha256, and serves
   them to its frames, so frames never fetch code from GitHub or an author's server. The frame checks the signature
   again with the public key built into the app ([`registry/public-key.b64`](registry/public-key.b64)).
4. The owner adds a plugin in the kinframe app and fills in its settings. An update with the same permissions runs at
   once; one that asks for more waits for the owner's approval; a revoked version stops.

The formats are in kinframe's [plugin design](https://github.com/jeroentrappers/kinframe/blob/main/docs/plugins.md)
(§3 manifest and code, §4 views, §7 the registry).

## Quick start

```sh
npm ci
npm run kit -- new community.my-plugin      # scaffold plugins/community.my-plugin
npm run kit -- preview community.my-plugin  # see it in the frame's forms at http://127.0.0.1:8770
npm run kit -- check community.my-plugin    # the rules CI applies
npm run kit -- test community.my-plugin     # its scenarios against their snapshots
npm test                                    # the kit's own tests
```

Node 22 or later. The kit has two dependencies, pinned: QuickJS (as WebAssembly) for the sandbox and ajv for the
view schema.

## Licences

The repository's own code (the kit, CI, documentation) is Apache-2.0 ([`LICENSE`](LICENSE)). Each plugin is a separate
work under the OSI-approved licence named in its `plugin.json`; the four plugins seeded from kinframe's examples are
Apache-2.0. Plugins are not covered by kinframe's CLA; contributions here are signed off under the
[Developer Certificate of Origin](DCO.md).
