# Contributor onboarding

GitHub contributor verification is an optional feature, off by default. When `CONTRIBUTOR_VERIFICATION_ENABLED=true` (configuration in [Setup — Contributor verification](setup.md#contributor-verification-optional)), a user signed in to the Heka web UI with the existing Heka OIDC session can prove that they own a GitHub account and a GPG key published on it, and receive a verifiable credential that says so. The web UI shows the steps when its own flag, `REACT_APP_FEATURE_CONTRIBUTOR_VERIFICATION`, is on.

## Flow

1. **Link GitHub.** The web UI calls `POST /v2/contributor-onboarding/github/link/start` and follows the returned GitHub authorization URL. The identity service stores only a hash of the single-use state, bound to the user, wallet and tenant that started the link, and uses PKCE. It requests no OAuth scopes. GitHub redirects to the web UI's `/github/callback`, which posts the code to `POST /v2/contributor-onboarding/github/link/callback`. The service reads the account with the token, then revokes the token. Linking does not create a session.
   - The binding belongs to the OIDC subject and records GitHub's numeric account id, so a later username change does not create a second person, and a change of role or organization keeps the binding. One GitHub account can be linked to one Heka user at a time.
   - `DELETE /v2/contributor-onboarding/github` unlinks: it deletes the binding with its GPG verification, pending link attempts and open challenges. Credentials already issued stay valid until they expire, unless an operator revokes them (see [Revocation](#revocation)).
2. **GPG challenge.** `POST /v2/gpg-challenge/request` returns a nonce. It expires in 5 minutes and works once. Sign it with `echo -n "<nonce>" | gpg --clearsign --armor` and submit the armored output to `POST /v2/gpg-challenge/verify`. The service checks the signature against the keys published at `https://github.com/<login>.gpg`, and only if that login still resolves to the linked account id. The signature must be dated within the challenge's window (from 5 minutes before the challenge was issued to 5 minutes after the submission), and the key that made it must be valid now: an expired or revoked key fails even with a signature dated back to when it was valid.
3. **Credential.** After the signature is verified, `POST /v2/contributor-credential/offer` (`201`) returns an `openid-credential-offer://` URI, a numeric transaction code of 8 digits, the offer's expiry and its issuance session id. The code is not inside the URI; the wallet asks for it. The offer can be redeemed for 10 minutes. `GET /v2/contributor-credential/offer/{issuanceSessionId}` returns the offer's state (`OfferCreated` … `Completed`, or `Error`) and expiry, for the user who requested it only.

The web UI shows the offer as a QR code with the transaction code, for a mobile wallet, and hands it to the Heka Web Wallet browser extension when it is installed (see the [bridge protocol](../../heka-web-wallet/docs/bridge-protocol.md)). It polls the offer's state until the credential is received. Recovery after a lost holder key or cleared extension data is re-issuance, not export (see [the wallet lifecycle](../../heka-web-wallet/docs/wallet-lifecycle.md)).

## The issuer

The credential is issued by an organization: the wallet of `CONTRIBUTOR_ISSUER_ORG_ID`, signing with `CONTRIBUTOR_ISSUER_DID`. An OrgAdmin of that organization sets it up through the normal web UI, following the [issuer setup runbook](runbooks/issuer-setup.md):

1. sign in once, which creates the organization's wallet;
2. create a DID (`did:hedera`, `did:indybesu` or `did:key`) with its OpenID4VC issuer, for example with `POST /prepare-wallet`, and set `CONTRIBUTOR_ISSUER_DID` to it;
3. set the issuer name and logo that wallets show (self-declared): preparing the wallet takes them from the OrgAdmin's profile, so set them on the web UI's Profile page (`PATCH /user`), or for this DID's issuer alone with `PUT /openid4vc/issuer/{issuerId}` and `"action": "replace"`;
4. create a schema named `GitHub Contributor` with exactly the fields `githubAccountId`, `githubUsername`, `gpgFingerprint` and `verifiedAt`;
5. register that schema for OpenID4VC `vc+sd-jwt` on the DID.

The service writes nothing into the organization. It checks the setup at startup (one warning naming what is missing, or one info line when it is ready) and again on every offer, so a completed setup takes effect without a restart. Until the setup is complete, the offer answers `503` with what is missing.

The offer is the organization's own generic OpenID4VC offer, made in its wallet: the credential gets an IETF Token Status List entry and appears in the organization's issued credentials like any other.

**Trust.** Whoever acts in the organization's wallet and may offer credentials (OrgAdmin and OrgManager; with the role model off, every member) can also issue a credential with these claims through the generic issuance routes, like any other credential of the organization. Choose its members accordingly. Nobody outside the organization can: the signing key is in the organization's wallet, and an Issuer of the organization has a wallet of its own.

## The credential

An SD-JWT VC (`vc+sd-jwt`), bound to the holder's key (`cnf.jwk`), valid for 90 days.

| Claim             | Disclosure              | Content                                                                                                                              |
| ----------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `iss`             | always                  | `CONTRIBUTOR_ISSUER_DID`.                                                                                                            |
| `iat`, `exp`      | always                  | Issuance and expiry (90 days later).                                                                                                 |
| `vct`             | always                  | `GitHub Contributor`, the schema's name: a plain string, so wallets and verifiers don't try to fetch type metadata from a URL.       |
| `cnf`             | always                  | The holder's public key.                                                                                                             |
| `status`          | always                  | The credential's entry in the organization's token status list.                                                                      |
| `verifiedAt`      | always                  | ISO-8601 time of the GPG verification.                                                                                               |
| `githubAccountId` | selectively disclosable | GitHub's numeric account id, as a string. A verifier that matches the holder to a GitHub account asks for it.                        |
| `githubUsername`  | selectively disclosable | The login at verification time; logins can change.                                                                                   |
| `gpgFingerprint`  | selectively disclosable | Uppercase hex fingerprint of the key that made the signature: for a signing subkey, the subkey's fingerprint, not the primary key's. |

No claim identifies the Heka user or wallet. The values come from the user's own binding, never from the request.

The credential is signed with the first key of the DID that is an `assertionMethod` and that the organization's wallet can sign with, as for any OpenID4VC offer.

## Revocation

Operators revoke a contributor credential from the organization's issued credentials (the web UI's list, or `GET /openid4vc/issuance-session` and `POST /openid4vc/issuance-session/{id}/revoke`), like any other. The issuance session carries the credential's claims, so the credential of a GitHub account or a GPG key can be found by them.

Unlinking GitHub, linking another account or verifying another key revokes nothing: an issued credential stays valid until its `exp` unless an operator revokes it. The service keeps a record of each contributor offer (`contributor_credential_issuance`: user, issuance session, GitHub account and key fingerprint); it stays after an unlink. Runbooks: [GPG key compromise](runbooks/gpg-key-compromise.md), [issuer DID rollover](runbooks/issuer-did-rollover.md).

## Limitations

- **GitHub rate limit.** The verification step reads `api.github.com/users/<login>` and `github.com/<login>.gpg` without credentials. GitHub allows 60 unauthenticated REST requests per hour per IP address, shared by every user of the instance. Once they are used up, verification answers `429` until GitHub's window resets.
- **Per-process rate limits.** Each contributor route accepts 10 requests per minute per user, the offer state 60 (the web UI polls it). The counters live in the process: several instances each count separately.
- **Tables when disabled.** The five tables (`contributor_binding`, `contributor_audit_event`, `oauth_link_attempt`, `gpg_challenge`, `contributor_credential_issuance`) are created by the migrations whether or not the feature is enabled. Deleting a user deletes its rows in all of them except the audit log.

See also [Contributor troubleshooting](contributor-troubleshooting.md).
