# TOCTOU remediation plan

Status: proposed
Scope: `heka-sso-service` (Phase 0 scaffold — signing-key store), plus guard rails for the Phase 1 oidc-provider adapter where the same bug class has security impact.

## Background

A TOCTOU (time-of-check to time-of-use) race is a "check, then act" sequence where the
checked condition can change between the check and the action — typically when two
service replicas (or two concurrent requests in one process) interleave. Postgres
does not prevent these unless the check and the action are made atomic (a single
conditional statement) or serialized (a lock).

This plan inventories every such pattern in the service, fixes the confirmed ones,
and records the invariants the Phase 1 adapter must uphold so the class doesn't
reappear with higher stakes.

## Inventory

### Confirmed issues

#### 1. `SigningKeysService.ensureKeys` — check-then-create race (the flagged issue)

`src/oidc/signing-keys.service.ts:69-77`

```ts
const active = await this.em.count(OidcSigningKey, { alg, retiredAt: null })  // check
if (active === 0) {
  const key = await this.generateAndPersistKey(alg)                            // act
}
```

Two replicas starting against an empty database both count 0 and both insert a key
per algorithm. The DB cannot stop this: the only unique constraint is `kid`
(`oidc-signing-key.entity.ts:13`), and independently generated keys have different
thumbprints, so both inserts succeed.

**Impact.** Two active keys per alg is superficially the same as rotation overlap,
but combined with the startup JWKS snapshot it can break verification: instance A's
`find` (line 50) may run before instance B's insert commits, so A publishes and
signs with only key A while B signs with key B. A client behind the load balancer
can fetch A's JWKS and receive a B-signed token — signature validation fails until
a restart.

**Note on the "obvious" fix.** A partial unique index `UNIQUE (alg) WHERE
retired_at IS NULL` is **wrong** here: the rotation overlap model intentionally
keeps two active keys per alg, and the index would make `rotateKey` fail. Use the
advisory lock instead (see Design below).

#### 2. `SigningKeysService.retireKey` — missing last-active-key guard, and the guard itself must not be a new TOCTOU

`src/oidc/signing-keys.service.ts:64-67`

`retireKey` will happily retire the only active key for an algorithm, leaving the
JWKS without a signing key for that alg (regenerated on next restart, but live
instances keep a stale snapshot). The naive guard — count actives, then retire —
would introduce exactly the bug class this plan removes: two concurrent retires of
the two active keys would each see `count == 2` and together retire both.

Fix by making check and act one statement (or by running under the same advisory
lock as `ensureKeys`):

```sql
UPDATE oidc_signing_key k SET retired_at = now()
WHERE k.kid = :kid AND k.retired_at IS NULL
  AND EXISTS (SELECT 1 FROM oidc_signing_key o
              WHERE o.alg = k.alg AND o.retired_at IS NULL AND o.kid <> k.kid)
```

Zero rows affected ⇒ either unknown/already-retired kid or last active key; report
which and refuse.

### Audited and safe (no change needed)

- `retireKey`'s conditional `nativeUpdate({ kid, retiredAt: null })` is atomic and
  idempotent for *concurrent retires of the same kid* — the second call matches
  zero rows. (The issue above is about retiring *different* kids of the same alg.)
- `rotateKey` performs no check before inserting, so it is not a TOCTOU; two
  concurrent rotations produce two fresh keys, which the overlap model tolerates
  (both are published; newest wins for signing). Serializing it under the advisory
  lock is a free byproduct of the design below, so we do it, but it is hardening,
  not a bug fix.
- `oidc.config.ts` `resolveJwksOverride` reads the JWKS file with a single
  `readFileSync` inside try/catch — no exists-then-read sequence, so no filesystem
  TOCTOU.
- Config constructors (`health.config.ts`, `throttle.config.ts`, …) run once at
  bootstrap on immutable env input — no concurrency.

### Adjacent, tracked but out of scope here

- **JWKS snapshot staleness**: each instance snapshots `getJwks()` at startup, so
  rotation only propagates on restart. Not a race, but it amplifies issue 1's
  impact and constrains the rotation runbook. Track as its own item (either
  periodic re-read or provider re-init on rotate).

## Design: one serialization primitive

Add a Postgres **transaction-scoped advisory lock** around every signing-key
mutation. Advisory locks work across replicas, take no schema change, cannot leak
(released automatically at commit/rollback), and — unlike a partial unique index —
do not conflict with the rotation overlap model.

```ts
// src/core/database/advisory-locks.ts
/** Namespace for pg_advisory_xact_lock(classid, objid) — pick once, never reuse. */
export const ADVISORY_LOCK_CLASS = 0x4845_4b41 // 'HEKA'
export const enum AdvisoryLockId {
  oidcSigningKeys = 1,
}
```

```ts
// SigningKeysService
private async withSigningKeysLock<T>(fn: (em: EntityManager) => Promise<T>): Promise<T> {
  return this.em.transactional(async (em) => {
    await em.execute('select pg_advisory_xact_lock(?, ?)', [ADVISORY_LOCK_CLASS, AdvisoryLockId.oidcSigningKeys])
    return fn(em)
  })
}
```

Rules:

1. **Re-check inside the lock.** The count in `ensureKeys` moves inside
   `withSigningKeysLock`; the losing replica re-counts after the winner commits and
   sees `active > 0`.
2. **Read the published set in the same transaction** (`getJwks`'s `find`), so a
   replica never signs with a snapshot that omits a key another replica just
   created during the same startup window.
3. Every mutation path (`ensureKeys`, `rotateKey`, `retireKey`) goes through the
   helper. `retireKey` additionally becomes the conditional single-statement
   update above — the lock alone would fix it, but the atomic statement keeps the
   method correct even if someone later calls it outside the helper.

## Implementation steps

1. Add `advisory-locks.ts` with the class/id constants; export from
   `src/core/database/index.ts`.
2. Rework `SigningKeysService`:
   - `withSigningKeysLock` helper as above (use the forked `em`'s
     `transactional`, and thread the transactional `em` through
     `generateAndPersistKey` instead of `this.em`).
   - `getJwks` (non-override path): single `withSigningKeysLock` call that runs
     `ensureKeys` and the `find`, returning the mapped keys.
   - `rotateKey`: wrap `generateAndPersistKey` in the helper.
   - `retireKey`: replace `nativeUpdate` with the conditional update (via
     `em.execute` or a QB with the `EXISTS` subquery); throw a descriptive error
     when zero rows are affected and the kid still exists and is active (last
     active key for its alg).
3. Tests (Vitest):
   - Unit: `retireKey` refuses to retire the last active key; still retires when
     another active key of the same alg exists; stays idempotent for a retired kid.
   - Concurrency (integration, real Postgres via the existing docker-compose dev
     DB): fire `getJwks()` from two independent `MikroORM.init` instances (two
     connections — advisory locks are per-connection, so an in-process mock proves
     nothing) against a truncated table; assert exactly one active key per alg and
     that both returned JWKS contain the same key set.
   - Concurrency: two parallel `retireKey` calls for the two active keys of one
     alg; assert exactly one succeeds.
4. Docs: extend the "Key rotation" section of the README with the lock behavior
   and the new `retireKey` failure mode.

## Guard rails for Phase 1 (oidc-provider Postgres adapter)

The adapter will manage single-use artifacts where this bug class stops being a
startup nuisance and becomes a security hole. Record these as review requirements
for the adapter PR:

- **Authorization code / device code consumption** must be one atomic statement —
  `UPDATE ... SET consumed = now() WHERE id = ? AND consumed IS NULL` (or
  `DELETE ... RETURNING`) — never find-then-mark. A code consumed twice is a token
  replay.
- **Refresh token rotation** must detect reuse the same way (conditional update on
  the unconsumed row; on zero rows, treat as reuse and revoke the grant family).
- **Session/grant upserts** must use `INSERT ... ON CONFLICT` (MikroORM
  `em.upsert`) rather than findOne-then-persist.

## Acceptance criteria

- Two fresh replicas booting against an empty database end up with exactly one
  active key per algorithm, and both publish identical JWKS.
- `retireKey` can never reduce an algorithm to zero active keys, including under
  concurrent calls.
- No remaining `count`/`find` followed by a dependent write outside a
  `withSigningKeysLock` transaction in `src/oidc/`.
- CI (`yarn test`) covers the three concurrency scenarios above.
