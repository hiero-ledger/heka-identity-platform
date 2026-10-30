# Contributor data migration

Auth-service and identity-service use separate databases. Contributor bindings, GPG challenges, and onboarding audit events now belong to the identity database.

## Prototype and mentorship

No production bindings exist. Discard developer rows that were written to the auth-service database. Do not copy `User_github:<accountId>` wallet ids forward. A binding is created only after a Heka user links GitHub, and `walletId` is that user's `AuthInfo.walletId`.

## Production path

1. Export `contributor_bindings` from the auth-service database.
2. Map each row to an existing Heka `userId`, `tenantId`, and real `walletId`. Rows that cannot be mapped to a Heka user are not imported.
3. Insert the mapped rows into identity-service `contributor_bindings`. Keep `github_account_id` globally unique and `(tenant_id, user_id)` unique.
4. Leave `gpg_challenges` and audit events behind. Verification state that must survive is `gpg_fingerprint` and `verified_at` on the binding.
5. Apply `Migration20261029120000` before import so the identity tables exist.
