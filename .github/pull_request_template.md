## What this changes

<!-- New plugin, new version of a plugin, or a change to the kit / CI. One plugin per pull request, please. -->

## Review checklist

Author, tick what applies; the maintainer checks every item before merging.

- [ ] **Permissions:** `permissions` asks only for what the plugin needs, and the README says why (each host, `location`, `actions`).
- [ ] **Hosts:** every fixed `https://` origin in `permissions.http` belongs to the service the plugin is about; addresses the owner types use `settings.<key>` (with `local_only` for devices at home).
- [ ] **Changed permissions:** a new version that changes `permissions` says so here (frames wait for the owner's approval).
- [ ] **Version:** a changed plugin has a higher `version`; published versions are never replaced.
- [ ] **Licence:** `license` is an OSI-approved SPDX id, and all code in `main.js` may be published under it.
- [ ] **No secrets in fixtures or scenarios:** recorded answers hold no tokens, keys, passwords, home addresses or other personal data (`secrets` in scenarios are placeholders like `test-token`).
- [ ] **Terms of the services:** the services this plugin calls allow this use (third-party, and commercial if their terms say so); attribution is shown (a line in the detail view), rate limits are respected (`refresh.min_seconds`); see PUBLISHING.md.
- [ ] **Scenarios:** they cover the normal view, an empty or error state, and at least English and one other language; snapshots reviewed.
- [ ] **Translations:** `locales/en.json` (and others) translate the manifest (`@name`, `@setting.*`, …) and the plugin's own strings.
- [ ] **DCO:** every commit is signed off (`git commit -s`).

By opening this pull request I agree to the terms in [PUBLISHING.md](../PUBLISHING.md).
