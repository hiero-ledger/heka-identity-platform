# Contributor troubleshooting

For the optional contributor verification ([Contributor onboarding](contributor-onboarding.md)).

- **All contributor routes answer `404`.** The feature is off: set `CONTRIBUTOR_VERIFICATION_ENABLED=true`, the GitHub OAuth app settings and the issuer organization (`CONTRIBUTOR_ISSUER_ORG_ID`, `CONTRIBUTOR_ISSUER_DID`). The web UI needs its own flag too.
- **The service does not start: "Contributor verification configuration is invalid".** The message lists every missing or invalid setting: when enabled, the three OAuth app settings and both issuer settings are required, the organization id has no whitespace, and the DID has the form `did:<method>:<id>`.
- **Invalid, expired, or already-consumed OAuth state (`400`).** The link was started more than 5 minutes ago, the callback page was reloaded or opened again, or another Heka user opened it. Start the link again.
- **GitHub account already linked to another Heka user (`409`).** Unlink it from that user first: that user unlinks in the web UI, or calls `DELETE /v2/contributor-onboarding/github`.
- **Another request linked a GitHub account to this Heka user at the same time (`409`).** Two links for the same user finished together, and the other one won. Check the status; link again if it shows the wrong account.
- **Link a GitHub account first (`409`).** A challenge needs a linked GitHub account.
- **Expired challenge.** Request a new nonce. The previous one cannot be reused after 5 minutes or after one submission.
- **Missing GPG key.** Publish a key at `https://github.com/<login>.gpg` and request a new challenge. For a user without GPG keys, GitHub returns a placeholder block, which the service reports as a key that could not be parsed.
- **Signature dated outside the challenge window (`400`).** The signature must be made after the challenge was issued, with a correct clock (5 minutes of difference are accepted). Request a new challenge and sign it now.
- **Signing key expired or revoked (`400`).** The key that made the signature is no longer valid on GitHub. Publish a valid key, request a new challenge and sign with that key.
- **Login reused.** The login now belongs to a different numeric account. Link GitHub again with the account you own.
- **Too many requests (`429`).** Either more than 10 requests per minute to one route by the same user (60 for the offer state), or GitHub's limit for unauthenticated requests from this instance was reached. Wait a minute, or until GitHub's hourly window resets.
- **Credential not issued.** The offer answers `409` until the GPG verification is complete, and `404` without a binding.
- **The contributor credential issuer is not set up (`503`).** The message names the first missing piece; the startup log has the same warning. Check, in this order, with an OrgAdmin of `CONTRIBUTOR_ISSUER_ORG_ID` (see the [issuer setup runbook](runbooks/issuer-setup.md)):
  1. the organization's wallet exists: someone of the organization has signed in;
  2. `CONTRIBUTOR_ISSUER_DID` is a DID of that wallet (`GET /dids?own=true`) and is not deactivated;
  3. the organization has a schema named exactly `GitHub Contributor` with exactly the fields `githubAccountId`, `githubUsername`, `gpgFingerprint` and `verifiedAt`;
  4. that schema is registered for OpenID4VC `vc+sd-jwt` on `CONTRIBUTOR_ISSUER_DID`.

  No restart is needed once the setup is fixed, except after changing `CONTRIBUTOR_ISSUER_DID` or `CONTRIBUTOR_ISSUER_ORG_ID`.

- **Offer expired.** An offer can be redeemed for 10 minutes. Request a new one.
- **A credential must stop working.** Unlinking GitHub doesn't revoke issued credentials. An operator of the issuer organization revokes it from the organization's issued credentials (see [Revocation](contributor-onboarding.md#revocation) and the [GPG key compromise runbook](runbooks/gpg-key-compromise.md)).
- **Holder key gone.** Clearing the extension's data removes the wallet and its keys. Receive the credential again (see [the wallet lifecycle](../../heka-web-wallet/docs/wallet-lifecycle.md)).
