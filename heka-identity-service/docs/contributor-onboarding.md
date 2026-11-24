# Contributor onboarding

GitHub contributor verification is an optional feature, off by default. When `CONTRIBUTOR_VERIFICATION_ENABLED=true` (configuration in [Setup — Contributor verification](setup.md#contributor-verification-optional)), a user signed in to the Heka web UI with the existing Heka OIDC session can prove that they own a GitHub account and a GPG key published on it, and receive a verifiable credential that says so. The web UI shows the steps when its own flag, `REACT_APP_FEATURE_CONTRIBUTOR_VERIFICATION`, is on.

## Flow

1. **Link GitHub.** The web UI calls `POST /v2/contributor-onboarding/github/link/start` and follows the returned GitHub authorization URL. The identity service stores only a hash of the single-use state, bound to the user, wallet and tenant that started the link, and uses PKCE. It requests no OAuth scopes. GitHub redirects to the web UI's `/github/callback`, which posts the code to `POST /v2/contributor-onboarding/github/link/callback`. The service reads the account with the token, then revokes the token. Linking does not create a session.
   - The binding belongs to the OIDC subject and records GitHub's numeric account id, so a later username change does not create a second person, and a change of role or organization keeps the binding. One GitHub account can be linked to one Heka user at a time.
   - `DELETE /v2/contributor-onboarding/github` unlinks: it deletes the binding with its GPG verification, pending link attempts and open challenges. Credentials already issued stay valid until they expire.
2. **GPG challenge.** `POST /v2/gpg-challenge/request` returns a nonce. It expires in 5 minutes and works once. Sign it with `echo "<nonce>" | gpg --clearsign` and submit the armored output to `POST /v2/gpg-challenge/verify`. The service checks the signature against the keys published at `https://github.com/<login>.gpg`, and only if that login still resolves to the linked account id. The signature must be dated within the challenge's window (from 5 minutes before the challenge was issued to 5 minutes after the submission), and the key that made it must be valid now: an expired or revoked key fails even with a signature dated back to when it was valid.
3. **Credential.** After the signature is verified, `POST /v2/contributor-credential/offer` returns an `openid-credential-offer://` URI and a numeric transaction code. The code is not inside the URI; the wallet asks for it. The offer can be redeemed for 10 minutes.

The web UI hands the offer to the Heka Web Wallet browser extension through a message from the page's content script; there is no browser protocol handler. Credo runs only in the extension's `wallet.html`. Recovery after a lost holder key or cleared extension data is re-issuance, not export (see [the wallet lifecycle](../../heka-web-wallet/docs/wallet-lifecycle.md)).

## The credential

An SD-JWT VC (`vc+sd-jwt`), bound to the holder's key (`cnf.jwk`), valid for 90 days. There is no status list yet, so `exp` is the freshness bound after an unlink or a key change.

| Claim             | Disclosure              | Content                                                                                                                              |
| ----------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `iss`             | always                  | The issuer's DID.                                                                                                                    |
| `iat`, `exp`      | always                  | Issuance and expiry (90 days later).                                                                                                 |
| `vct`             | always                  | `https://hiero.ledger.org/vct/GithubContributorCredential`.                                                                          |
| `cnf`             | always                  | The holder's public key.                                                                                                             |
| `verifiedAt`      | always                  | ISO-8601 time of the GPG verification.                                                                                               |
| `githubAccountId` | selectively disclosable | GitHub's numeric account id, as a string. A verifier that matches the holder to a GitHub account asks for it.                        |
| `githubUsername`  | selectively disclosable | The login at verification time; logins can change.                                                                                   |
| `gpgFingerprint`  | selectively disclosable | Uppercase hex fingerprint of the key that made the signature: for a signing subkey, the subkey's fingerprint, not the primary key's. |

No claim identifies the Heka user or wallet. The values come from the user's own binding, never from the request.

The credential is signed with the issuer DID's assertion key, chosen by purpose rather than by position in the DID document: `#assertion-key`, else `#did-root-key` (Hedera), else the only `assertionMethod`.

## Limitations

- **Provisional issuer.** The issuer is the wallet of the user named by `DEMO_USER` (see [Setup](setup.md#contributor-verification-optional)). Its owner can also issue a credential with these claims through the generic issuance API. A dedicated issuer organization will replace it.
- **GitHub rate limit.** The verification step reads `api.github.com/users/<login>` and `github.com/<login>.gpg` without credentials. GitHub allows 60 unauthenticated REST requests per hour per IP address, shared by every user of the instance. Once they are used up, verification answers `429` until GitHub's window resets.
- **Per-process rate limits.** Each contributor route accepts 10 requests per minute per user. The counters live in the process: several instances each count separately.
- **Tables when disabled.** The four tables (`contributor_binding`, `contributor_audit_event`, `oauth_link_attempt`, `gpg_challenge`) are created by the migrations whether or not the feature is enabled.
- **No revocation.** An issued credential stays valid until `exp`, also after an unlink.

See also [Contributor troubleshooting](contributor-troubleshooting.md).
