import { CustomBaseEntity } from '@core/database/entities/custom-base-entity'
import { Entity, Index, Property, Unique } from '@mikro-orm/decorators/legacy'

/**
 * Signing key material for the OP's JWKS (INTEGRATION.md Phase 0). Keys are
 * generated on first start and live only here (feasibility §3.2 component
 * architecture) — an env/file override exists for dev (`OIDC_JWKS`/`OIDC_JWKS_FILE`).
 */
@Entity()
export class OidcSigningKey extends CustomBaseEntity {
  /** RFC 7638 JWK thumbprint — published as the JWT `kid`. */
  @Property({ nullable: false, type: 'string' })
  @Unique()
  public kid!: string

  @Property({ nullable: false, type: 'string' })
  @Index()
  public alg!: string

  /** Full private JWK (including `kid`, `alg`, `use`) — the only copy of the key material. */
  // TODO: setup encryption (encryption at-rest in DB as a rule, other options) for this value.
  @Property({ nullable: false, type: 'json' })
  public jwk!: Record<string, unknown>

  /** Set when rotated out — retired keys are no longer published in the JWKS. */
  @Property({ nullable: true, type: 'datetime' })
  @Index()
  public retiredAt?: Date | null

  public constructor(partial?: Partial<OidcSigningKey>) {
    super()
    Object.assign(this, partial)
  }
}
