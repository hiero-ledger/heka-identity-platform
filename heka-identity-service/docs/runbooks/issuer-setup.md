# Contributor credential issuer setup

The contributor credential is issued by an organization's wallet (see [the issuer](../contributor-onboarding.md#the-issuer)). The service only checks the setup; an OrgAdmin of the organization makes it through the web UI or the API. Until it is complete, `POST /v2/contributor-credential/offer` answers `503` with the first missing piece, and the startup log has the same warning.

1. **Choose the organization.** Its id is the organization claim of its members' tokens. Everyone who acts in its wallet and may offer credentials (OrgAdmin and OrgManager; with the role model off, every member) can issue credentials with the contributor claims through the generic routes, so keep it to the people who operate the issuer.
2. **Create the organization's wallet.** An OrgAdmin of the organization signs in to the web UI once.
3. **Create the issuer DID** with its OpenID4VC issuer: prepare the organization's wallet in the web UI, or call `POST /prepare-wallet` as the OrgAdmin. It creates a `did:key` and a DID of each enabled ledger method, each with an OpenID4VC issuer. `GET /dids?own=true` lists them. Pick the DID verifiers will trust; a ledger DID (`did:hedera`, `did:indybesu`) can be rolled over later (see [issuer DID rollover](issuer-did-rollover.md)).
4. **Name the issuer** that wallets show. Preparing the wallet set the issuer's display from the OrgAdmin's own profile, i.e. their name. As the OrgAdmin, set the issuer name, logo and background colour on the web UI's Profile page (`/profile`), or with `PATCH /user` (multipart `name`, `logo`, `backgroundColor`; any role). That rewrites the display of every OpenID4VC issuer of the organization's wallet, so a later profile change by anyone acting in that wallet rewrites it again. To set the display of this DID's issuer alone, call `PUT /openid4vc/issuer/<CONTRIBUTOR_ISSUER_DID>` as an OrgAdmin or OrgManager with `{"action": "replace", "display": [{"name": "…", "logo": {"uri": "https://…"}, "background_color": "#…"}]}`: `replace` keeps the credential configurations, while a request without `action` empties the display. Wallets show this name as the issuer's; it is self-declared and nothing verifies it, so verifiers trust the `iss` DID, not the name.
5. **Configure the service** and restart it:

   ```bash
   CONTRIBUTOR_ISSUER_ORG_ID=<organization id>
   CONTRIBUTOR_ISSUER_DID=<the DID from step 3>
   ```

   With `CONTRIBUTOR_VERIFICATION_ENABLED=true`, the service refuses to start without them.

6. **Create the schema** `GitHub Contributor` in the organization, with exactly the fields `githubAccountId`, `githubUsername`, `gpgFingerprint` and `verifiedAt` (the web UI's schemas page, or `POST /v2/schemas`). Its name becomes the credential's `vct`.
7. **Register the schema** for OpenID4VC, format `vc+sd-jwt`, on the DID of step 3 (the schema's registration in the web UI, or `POST /v2/schemas/{id}/registration` with `{"protocol": "OpenId4VC", "credentialFormat": "vc+sd-jwt", "network": "<method>", "did": "<DID>"}`).
8. **Check.** The next offer succeeds; no restart is needed after steps 4, 6 and 7. After a restart, the log says "The contributor credential issuer is set up: `<DID>` in wallet `Organization_<id>`".

The contributor credentials then appear in the organization's issued credentials, where operators revoke them (see [GPG key compromise](gpg-key-compromise.md)).
