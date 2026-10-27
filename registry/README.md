# registry/

- `public-key.b64`: the registry's public key (ECDSA P-256, SubjectPublicKeyInfo, DER, base64). The kinframe server
  (`KINFRAME_PLUGIN_REGISTRY_KEY`) and the frame app verify `index.json` with it; CI verifies every index it publishes
  and the previous one it builds on. The private key lives only in the repository secret `REGISTRY_PRIVATE_KEY`.
- `revoked.json`: withdrawn versions, carried into the index's `revoked` on the next publication:

  ```json
  [ { "id": "community.x", "version": "1.0.1", "reason": "sent the token to the wrong host" } ]
  ```

  Frames stop a revoked version and fall back to the newest earlier version with the same permissions. A revocation
  can't be undone (CI refuses an index that drops one): publish a new version instead. Only maintainers merge changes
  here.
