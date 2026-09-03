/**
 * Transaction-scoped Postgres advisory locks — the serialization primitive
 * for cross-replica check-then-act sequences (docs/toctou-remediation-plan.md).
 * `pg_advisory_xact_lock(classid, objid)` takes no schema change, works across
 * replicas, and is released automatically at commit/rollback, so it cannot
 * leak on error paths.
 */

/** Namespace (classid) for `pg_advisory_xact_lock(classid, objid)` — picked once, never reuse. */
export const ADVISORY_LOCK_CLASS = 0x4845_4b41 // 'HEKA'

/** Lock ids (objid) within the namespace — append only, never renumber. */
export enum AdvisoryLockId {
  oidcSigningKeys = 1,
}
