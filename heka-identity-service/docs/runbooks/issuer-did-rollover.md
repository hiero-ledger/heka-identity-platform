# Issuer DID rollover

Moves the contributor credential to a new DID of the same issuer organization. On its own, it revokes nothing: credentials signed by the old DID stay valid until their `exp` (90 days).

1. **Create the new DID** in the issuer organization, with its OpenID4VC issuer, as in [issuer setup](issuer-setup.md) step 3, and give its issuer the organization's display name (step 4 there).
2. **Register the `GitHub Contributor` schema** for OpenID4VC `vc+sd-jwt` on the new DID (step 7 there). The registration on the old DID can stay.
3. **Point the service at it:** set `CONTRIBUTOR_ISSUER_DID` to the new DID and restart. The startup log says whether the setup is complete; new offers are signed by the new DID.
4. **Tell the verifiers** to trust the new DID next to the old one, and to drop the old one once the credentials it signed have expired.
5. **If the old key is compromised,** revoke the credentials the old DID signed: the organization's issued credentials, `GET /openid4vc/issuance-session?publicIssuerId=<old DID>`, then `POST /openid4vc/issuance-session/{id}/revoke` for each (see [GPG key compromise](gpg-key-compromise.md)). Then deactivate the old DID (`POST /dids/{did}/deactivate`) and tell the contributors to request new credentials. Revoke first: the status list of those credentials is signed with the old DID's key.

Adapted from the runbook darshit2308 wrote on the `feat/week16-security` branch.
