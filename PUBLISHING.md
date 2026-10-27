# Publishing terms

These terms apply to every plugin submitted to this repository (the "registry"), by whoever submits it (the "author").
Opening a pull request that adds or changes a plugin means agreeing to them.

## What the author confirms

1. **The right to license.** You wrote the plugin, or otherwise have the right to publish all of it, and you license
   it under the OSI-approved licence named in its `plugin.json`. Code copied from elsewhere keeps its own licence and is
   compatible with the plugin's, and its origin is noted. No code from proprietary apps or services.
2. **Distribution.** You agree that the maintainers of this repository, and the kinframe project and the servers that
   run it, may build your plugin into bundles, sign them, mirror them, and distribute them to kinframe servers and
   frames, without asking you each time. This doesn't change your copyright or your plugin's licence.
3. **Withdrawal.** The maintainers may withdraw (revoke) any published version at any time, without notice, for
   security, legal or policy reasons: a frame then stops that version. They may also refuse or remove a plugin, and fix
   a plugin that broke. Published bundles are never altered; a fix is a new version.
4. **The services a plugin calls.** A plugin must respect the terms of every service it talks to:
   - it may only use a service whose terms allow access by third-party software and, where the terms distinguish,
     by the kind of use a family photo frame is (if the terms forbid third-party or commercial access, the plugin's
     README documents the permission the author obtained);
   - it shows the attribution the terms or the data's licence require, as a line of text in the detail view (and
     credits the source in its README);
   - it stays within the service's rate limits (`refresh.min_seconds`, no more requests per update than needed) and
     handles `429 Too Many Requests` by failing the update with a clear message rather than retrying at once;
   - it sends no data to a service beyond what the feature needs, and never the owner's secrets to anyone but the
     service they belong to.
   The frame identifies itself to every service with its own User-Agent (`kinframe-frame/<version>`); a plugin can't
   change that.
5. **No secrets or personal data** in the repository: fixtures and scenarios hold recorded answers with tokens,
   addresses and other personal data removed.
6. **Support.** You answer issues about your plugin when you can. A plugin whose service is gone, or that stays broken
   and unmaintained, may be withdrawn.

## What the maintainers do

- Review every new plugin and every change to permissions by hand, and run the kit's checks and scenarios on every
  change.
- Publish only from `main`, through CI, with the registry key that never leaves the repository's secrets.
- Record every withdrawal, with its reason, in [`registry/revoked.json`](registry/revoked.json), which is public.

These terms may change; a change applies to versions published after it is merged.
