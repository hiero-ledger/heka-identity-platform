# GPG key compromise

When a contributor's GPG key is compromised or replaced, or their GitHub account is, revoke the credentials that carry it, then let the contributor verify again. Unlinking GitHub or verifying another key revokes nothing: an issued credential stays valid until its `exp` (90 days) unless it is revoked.

1. **Find the credentials.** As an OrgAdmin of the issuer organization (`CONTRIBUTOR_ISSUER_ORG_ID`), open its issued credentials in the web UI, or call `GET /openid4vc/issuance-session?publicIssuerId=<CONTRIBUTOR_ISSUER_DID>`. Each session carries the credential's claims in `issuanceMetadata.credentials[0].payload`: match `gpgFingerprint` for a key, `githubAccountId` for an account. The service's `contributor_credential_issuance` table maps the same claims to the Heka user and the issuance session id.
2. **Revoke them** from the list, or with `POST /openid4vc/issuance-session/{id}/revoke`. The status list entry turns invalid; verifiers that check it reject the credential once their copy of the list expires (5 minutes).
3. **Verify again.** The contributor removes the compromised key from GitHub and publishes a new one, requests a new GPG challenge, signs it with the new key, and requests a new credential. If the GitHub account itself was compromised, they unlink it and link it again first; the binding follows GitHub's numeric account id, not the login.

Adapted from the runbook darshit2308 wrote on the `feat/week16-security` branch.
