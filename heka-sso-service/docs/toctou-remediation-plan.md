# TOCTOU remediation plan

Status: **implemented** (2026-09-02). All three confirmed issues are fixed:
`src/core/database/advisory-locks.ts` exists, every `SigningKeysService` database path
runs under the `oidcSigningKeys` advisory lock, `retireKey` is the conditional
single-statement update with the last-active-key guard, and `MikroOrmAdapter.consume`
is conditional on the row being unconsumed. Covered by unit tests
(`test/unit/signing-keys.spec.ts`, `test/unit/mikro-orm.adapter.spec.ts`) and the
cross-connection concurrency suite `test/toctou.e2e.test.ts` (all four scenarios below,
`yarn test:e2e`). The README "Key rotation" runbook documents the lock, the new
`retireKey` failure mode, and the guarded SQL. The issue write-ups below are kept as
the record of what was wrong and why the fix is shaped this way.

Scope: `heka-sso-service` — signing-key store, plus the oidc-provider MikroORM adapter
where the same bug class has security impact.

## Background

A TOCTOU (time-of-check to time-of-use) race is a "check, then act" sequence where the
checked condition can change between the check and the action — typically when two
service replicas (or two concurrent requests in one process) interleave. Postgres
does not prevent these unless the check and the action are made atomic (a single
conditional statement) or serialized (a lock).

This plan inventories every such pattern in the service, fixes the confirmed ones,
and records the invariants the oidc-provider adapter must uphold so the class doesn't
reappear with higher stakes.

## Inventory

### Confirmed issues

#### 1. `SigningKeysService.ensureKeys` — check-then-create race (the flagged issue)

`SigningKeysService.ensureKeys` — **fixed**: the count-then-create now runs inside
`withSigningKeysLock`, and `getJwks` performs the ensure and the published-set read in
the same locked transaction. The original defect:

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
`find` (`signing-keys.service.ts:50`) may run before instance B's insert commits, so
A publishes and signs with only key A while B signs with key B. A client behind the
load balancer can fetch A's JWKS and receive a B-signed token — signature validation
fails until a restart.

**Note on the "obvious" fix.** A partial unique index `UNIQUE (alg) WHERE
retired_at IS NULL` is **wrong** here: the rotation overlap model intentionally
keeps two active keys per alg, and the index would make `rotateKey` fail. Use the
advisory lock instead (see Design below).

#### 2. `SigningKeysService.retireKey` — missing last-active-key guard, and the guard itself must not be a new TOCTOU

`SigningKeysService.retireKey` — **fixed**: implemented as the conditional
single-statement update below, run under the same advisory lock; zero affected rows
with the kid still active throws a "last active key" error, while an unknown or
already-retired kid stays a no-op. The original defect:

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

The README's "Key rotation" runbook (step 3) used to suggest raw
`update oidc_signing_key set retired_at = now() where kid = …` SQL with the same
missing guard — it now carries the guarded statement.

#### 3. Adapter `consume` — reuse detection is find-then-check at the provider level

`MikroOrmAdapter.consume` — **fixed**: the update now carries `consumedAt: null` in
its condition and throws when zero rows match, so the losing concurrent consumer
fails its token request. The original defect:

The adapter's `consume` was a single atomic `nativeUpdate`, but it was unconditional
(`WHERE name = ? AND id = ?`, no `AND consumed_at IS NULL`) and returns void. Reuse
detection therefore happened entirely in oidc-provider core: it `find`s the artifact,
inspects the `consumed` timestamp in the payload, and only then consumes. That is a
find-then-mark sequence spanning two statements — exactly what the original guard
rails prohibited. Two concurrent token requests presenting the same authorization
code (or the same rotated-out refresh token) could both `find` it unconsumed and both
succeed before either `consume` commits. An authorization code consumed twice is a
token replay; a refresh token reused without detection defeats rotation's theft
detection.

**Fix.** Make `consume` conditional and fail loudly on the losing side:

```ts
const affected = await this.em
  .fork()
  .nativeUpdate(OidcEntity, { name: this.name, id, consumedAt: null }, { consumedAt: new Date() })
if (affected === 0) throw new Error(`${this.name} '${id}' is already consumed`)
```

The winner's update commits; the loser matches zero rows and throws, failing its
token request instead of issuing a second token. (oidc-provider surfaces an adapter
throw as a server_error on the losing request — safe-side behavior. The window where
this fires is exactly the window the provider's own consumed-check cannot see.)

### Audited and safe (no change needed)

- Adapter `upsert` (`mikro-orm.adapter.ts:23-35`) uses `em.upsert` (`INSERT … ON
  CONFLICT` on the composite PK) — the session/grant guard rail from the original
  plan is satisfied; no findOne-then-persist anywhere in the adapter.
- Adapter `destroy` / `revokeByGrantId` are single `nativeDelete` statements —
  atomic and idempotent.
- `retireKey`'s conditional `nativeUpdate({ kid, retiredAt: null })` is atomic and
  idempotent for *concurrent retires of the same kid* — the second call matches
  zero rows. (Issue 2 above is about retiring *different* kids of the same alg.)
- `rotateKey` performs no check before inserting, so it is not a TOCTOU; two
  concurrent rotations produce two fresh keys, which the overlap model tolerates
  (both are published; newest wins for signing). Serializing it under the advisory
  lock is a free byproduct of the design below, so we do it, but it is hardening,
  not a bug fix.
- `OidcCleanupService.removeExpiredEntities` (`oidc-cleanup.service.ts:21`) is a
  single conditional `nativeDelete` — two replicas running it concurrently just
  split the row count.
- `IdentityServiceTokenProvider.getToken` caches a service-account token with a
  check-then-act on `this.cached`/`this.inFlight`, but both steps run in one
  synchronous event-loop tick (`??=` with no intervening await), so requests in
  one process share a single login. Two replicas each logging in independently is
  acceptable — the auth service tolerates parallel sessions.
- `AccountClaimsStore` and `LoginEventsService`'s session map are synchronous
  in-memory `Map` operations — no interleaving in-process. (Their multi-instance
  limitation is a separate issue, see below.)
- `oidc.config.ts` `resolveJwksOverride` reads the JWKS file with a single
  `readFileSync` inside try/catch (`oidc.config.ts:618`) — no exists-then-read
  sequence, so no filesystem TOCTOU.
- Config constructors (`health.config.ts`, `throttle.config.ts`, …) run once at
  bootstrap on immutable env input — no concurrency.

### Adjacent, tracked but out of scope here

- **JWKS snapshot staleness**: `OidcModule`'s provider factory calls
  `signingKeys.getJwks()` once at startup (`oidc.module.ts:54`), so rotation only
  propagates on restart. Not a race, but it amplifies issue 1's impact and
  constrains the rotation runbook. Track as its own item (either periodic re-read
  or provider re-init on rotate).
- **In-memory stores vs. the Postgres adapter**: oidc-provider state is now
  multi-instance-capable (Postgres), but `AccountClaimsStore` (verified claims by
  `sub`) and `LoginEventsService`'s session→interaction map are still in-memory
  and single-instance — behind a load balancer, `findAccount` or event routing can
  land on an instance that never saw the login. Both files document this. Not a
  TOCTOU, but it must be resolved before the multi-replica deployment that makes
  issues 1–3 live concerns.

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

The adapter (issue 3) does **not** use the lock: its fix is a conditional
single-statement update, which is sufficient and cheaper than serializing the
token endpoint.

## Implementation steps (all done, 2026-09-02)

One deviation from the sketch above: `AdvisoryLockId` is a plain `enum`, not a
`const enum` — the test runner transpiles files in isolation
(`ts.transpileModule`), which cannot inline cross-file const-enum members.

The concurrency tests live in `test/toctou.e2e.test.ts` and run under
`yarn test:e2e` (they need the dev Postgres, like the rest of the e2e suite);
`yarn test` covers the single-connection unit scenarios.

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
3. Rework `MikroOrmAdapter.consume`: add `consumedAt: null` to the update
   condition and throw when zero rows are affected (issue 3).
4. Tests (Vitest — extend the existing `test/unit/signing-keys.spec.ts` and
   `test/unit/mikro-orm.adapter.spec.ts` where unit-level, plus new integration
   tests):
   - Unit: `retireKey` refuses to retire the last active key; still retires when
     another active key of the same alg exists; stays idempotent for a retired kid.
   - Unit: `consume` throws when the row is already consumed; sets `consumedAt`
     exactly once.
   - Concurrency (integration, real Postgres via the existing docker-compose dev
     DB): fire `getJwks()` from two independent `MikroORM.init` instances (two
     connections — advisory locks are per-connection, so an in-process mock proves
     nothing) against a truncated table; assert exactly one active key per alg and
     that both returned JWKS contain the same key set.
   - Concurrency: two parallel `retireKey` calls for the two active keys of one
     alg; assert exactly one succeeds.
   - Concurrency: two parallel `consume` calls for the same artifact; assert
     exactly one succeeds.
5. Docs: extend the "Key rotation" section of the README with the lock behavior
   and the new `retireKey` failure mode, and fix the raw-SQL retire example in
   step 3 of the runbook (it lacks the last-active-key guard).

## Acceptance criteria (all verified, 2026-09-02)

- ✅ Two fresh replicas booting against an empty database end up with exactly one
  active key per algorithm, and both publish identical JWKS
  (`test/toctou.e2e.test.ts`, two independent `MikroORM.init` connections).
- ✅ `retireKey` can never reduce an algorithm to zero active keys, including under
  concurrent calls (unit + e2e concurrency test).
- ✅ `MikroOrmAdapter.consume` succeeds at most once per artifact; the losing
  concurrent call fails its request instead of silently proceeding (unit + e2e
  concurrency test).
- ✅ No remaining `count`/`find` followed by a dependent write outside a
  `withSigningKeysLock` transaction in `src/oidc/` (adapter `consume` excepted —
  it is a self-contained conditional statement).
- ✅ The concurrency scenarios run in `yarn test:e2e` (real Postgres); the
  single-connection behavioral checks run in `yarn test`.
