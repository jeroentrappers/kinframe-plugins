# Contributing

Thank you for writing a plugin. [AUTHORING.md](AUTHORING.md) explains how; this page is about the pull request.

## A plugin, by pull request

1. Fork the repository and create a branch.
2. `npm ci`, then `npm run kit -- new community.<name>` (or copy a plugin close to yours).
3. Write it; record real answers into `fixtures/` (without tokens or personal data); add scenarios; run
   `npm run kit -- check <id>` and `npm run kit -- test <id> --update`, and review the snapshots it writes.
4. Open a pull request with the template's checklist filled in. **One plugin per pull request.**

CI runs the kit's tests, `kit check` and `kit test` on every plugin, checks that no published bundle would change and
that every commit is signed off. A maintainer (see [`.github/CODEOWNERS`](.github/CODEOWNERS)) reviews every new
plugin and every change to a manifest by hand, permissions above all.

### Updating a plugin

Raise `version` in `plugin.json` (semver) with every change to what goes into the bundle (`plugin.json`, `main.js`,
`locales/`). A published version is never replaced: CI refuses a changed bundle under a version that is already in
the registry, and a version lower than the last one. Changes to `README.md`, fixtures or scenarios alone don't need a
new version. A new version that changes `permissions` waits on every frame until its owner approves it: say so in the
pull request.

### Someone else's plugin

Open an issue or a pull request and mention the plugin's author. Maintainers may fix a plugin that breaks (an API that
changed) or withdraw a version that misbehaves; see [PUBLISHING.md](PUBLISHING.md).

## Sign-off (DCO)

Every commit is signed off under the [Developer Certificate of Origin](DCO.md): by adding

```
Signed-off-by: Jane Doe <jane@example.org>
```

(your real name and the e-mail of the commit's author) you certify that you wrote the contribution or otherwise have
the right to submit it under the licence it states. `git commit -s` adds the line; `git rebase --signoff main` adds it
to every commit of a branch. CI (`.github/scripts/check-dco.sh`) checks each commit of a pull request.

Plugins are separate works under their own OSI licence (the `license` in their `plugin.json`); they are not covered by
kinframe's CLA. The kit and the rest of this repository are Apache-2.0. By opening a pull request with a plugin you
also agree to the publishing terms in [PUBLISHING.md](PUBLISHING.md).

## The kit itself

Changes to `kit/` come with tests (`npm test`). `kit/host/` is not edited by hand: it is the frame's own prelude,
host libraries and view schema, refreshed with `kit/sync-host.sh <path to a kinframe checkout>` (the commit is recorded
in `kit/host/SOURCE`). Keep the kit's rules equal to the frame's: when kinframe changes `PluginManifest.kt`,
`PluginNet.kt`, `PluginFormat.kt` or `PluginViewParser.kt`, port the change and add its test cases.

## Code of conduct

Be kind and patient; review the code, not the person. Maintainers may remove anything that isn't.
