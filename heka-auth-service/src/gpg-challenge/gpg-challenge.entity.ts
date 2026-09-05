import { Entity, PrimaryKey, Property } from '@mikro-orm/decorators/legacy'

import { v4 as uuid } from 'uuid'

/**
 * Represents a single GPG ownership challenge session.
 *
 * Lifecycle:
 *   1. Created with a random nonce, a 5-minute expiry, and `consumed = false`.
 *   2. The contributor signs the nonce with their GPG private key and submits
 *      the armored output to POST /gpg-challenge/verify.
 *   3. On successful verification: `consumed` is set to `true`, `verifiedAt`
 *      is stamped, and `gpgFingerprint` is recorded.
 *   4. On a failed or expired verification: `consumed` is still set to `true`
 *      (burn-before-verify prevents replay attacks even on failure).
 *
 * The `verifiedAt` field is the canonical signal that a challenge completed
 * successfully.  A record where `consumed = true` but `verifiedAt` is null
 * indicates an attempted-but-failed verification.
 */
@Entity({ tableName: 'gpg_challenges' })
export class GpgChallenge {
  @PrimaryKey({ type: 'string' })
  public id: string = uuid()

  /** GitHub login of the contributor who requested this challenge. */
  @Property({ type: 'string' })
  public githubUsername!: string

  /**
   * Cryptographically random 64-character hex string (32 bytes).
   * The contributor must sign exactly this value with their GPG private key.
   */
  @Property({ type: 'string' })
  public nonce!: string

  /**
   * UTC timestamp after which the challenge is invalid.
   * Set to exactly 5 minutes from creation time.
   */
  @Property({ type: 'Date' })
  public expiresAt!: Date

  /**
   * Set to `true` immediately before the cryptographic verification attempt.
   * This burn-before-verify pattern prevents replay attacks even if the service
   * crashes or throws partway through verification.
   */
  @Property({ default: false, type: 'boolean' })
  public consumed: boolean = false

  /**
   * UTC timestamp at which the GPG signature was successfully verified.
   * Null if the challenge has not been successfully verified.
   */
  @Property({ nullable: true, type: 'Date' })
  public verifiedAt?: Date

  /**
   * Full fingerprint of the GPG key that produced the winning signature,
   * formatted as an uppercase hex string (e.g. "A1B2C3D4E5F6...").
   * Null until verification succeeds.
   */
  @Property({ nullable: true, type: 'string' })
  public gpgFingerprint?: string

  /**
   * GitHub numeric account ID of the authenticated contributor.
   * Populated after the contributor completes GitHub OAuth login.
   * Used to correlate this challenge with the ContributorBinding record.
   */
  @Property({ nullable: true, type: 'string' })
  public githubAccountId?: string

  /**
   * Heka wallet ID of the contributor, derived from their GitHub account ID.
   * Populated alongside `githubAccountId` after OAuth login.
   */
  @Property({ nullable: true, type: 'string' })
  public walletId?: string

  @Property({ onCreate: () => new Date(), type: 'Date' })
  public createdAt: Date = new Date()
}
