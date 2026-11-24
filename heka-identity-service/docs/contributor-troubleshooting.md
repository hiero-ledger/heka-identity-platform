# Contributor troubleshooting

For the optional contributor verification ([Contributor onboarding](contributor-onboarding.md)).

- **All contributor routes answer `404`.** The feature is off: set `CONTRIBUTOR_VERIFICATION_ENABLED=true` and the GitHub OAuth app settings. The web UI needs its own flag too.
- **Invalid, expired, or already-consumed OAuth state (`400`).** The link was started more than 5 minutes ago, the callback page was reloaded or opened again, or another Heka user opened it. Start the link again.
- **GitHub account already linked to another Heka user (`409`).** Unlink it from that user first (`DELETE /v2/contributor-onboarding/github`).
- **Link a GitHub account first (`409`).** A challenge needs a linked GitHub account.
- **Expired challenge.** Request a new nonce. The previous one cannot be reused after 5 minutes or after one submission.
- **Missing GPG key.** Publish a key at `https://github.com/<login>.gpg` and request a new challenge. For a user without GPG keys, GitHub returns a placeholder block, which the service reports as a key that could not be parsed.
- **Signature dated outside the challenge window (`400`).** The signature must be made after the challenge was issued, with a correct clock (5 minutes of difference are accepted). Request a new challenge and sign it now.
- **Signing key expired or revoked (`400`).** The key that made the signature is no longer valid on GitHub. Publish a valid key, request a new challenge and sign with that key.
- **Login reused.** The login now belongs to a different numeric account. Link GitHub again with the account you own.
- **Too many requests (`429`).** Either more than 10 requests per minute to one route by the same user, or GitHub's limit for unauthenticated requests from this instance was reached. Wait a minute, or until GitHub's hourly window resets.
- **Credential not issued.** The offer answers `409` until the GPG verification is complete, and `404` without a binding or while the issuer is not set up (`DEMO_USER`'s wallet and DID).
- **Holder key gone.** Clearing the extension's data removes the wallet and its keys. Receive the credential again (see [the wallet lifecycle](../../heka-web-wallet/docs/wallet-lifecycle.md)).
