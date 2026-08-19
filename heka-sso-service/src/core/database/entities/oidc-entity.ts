import { BaseEntity } from '@mikro-orm/core'
import { Entity, Index, PrimaryKey, Property } from '@mikro-orm/decorators/legacy'

/**
 * Storage for every `oidc-provider` model (INTEGRATION.md P1.5): sessions,
 * grants, authorization codes, access/refresh tokens, interactions, replay
 * detection, … — one row per model instance, keyed by (model name, id). The
 * full model state lives in the jsonb `payload`; `grantId`/`userCode`/`uid`
 * are copied out as indexed columns for the adapter's secondary lookups.
 * Expired rows are purged hourly by `OidcCleanupService`.
 */
@Entity()
export class OidcEntity extends BaseEntity {
  /** `oidc-provider` model name (Session, Grant, AuthorizationCode, AccessToken, …). */
  @PrimaryKey({ type: 'string', length: 64 })
  public name!: string

  /** Model instance id assigned by the provider. */
  @PrimaryKey({ type: 'string' })
  public id!: string

  @Property({ type: 'datetime', defaultRaw: 'now()' })
  public createdAt?: Date

  @Property({ type: 'datetime', defaultRaw: 'now()', onUpdate: () => new Date() })
  public updatedAt?: Date

  @Property({ nullable: false, type: 'json' })
  public payload!: Record<string, unknown>

  @Property({ nullable: true, type: 'string' })
  @Index()
  public grantId?: string | null

  @Property({ nullable: true, type: 'string' })
  @Index()
  public userCode?: string | null

  @Property({ nullable: true, type: 'string' })
  @Index()
  public uid?: string | null

  @Property({ nullable: true, type: 'datetime' })
  @Index()
  public expiresAt?: Date | null

  @Property({ nullable: true, type: 'datetime' })
  public consumedAt?: Date | null

  public constructor(partial?: Partial<OidcEntity>) {
    super()
    Object.assign(this, partial)
  }
}
