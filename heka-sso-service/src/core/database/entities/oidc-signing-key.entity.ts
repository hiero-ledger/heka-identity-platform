import { CustomBaseEntity } from '@core/database/entities/custom-base-entity'
import { Entity, Index, Property, Unique } from '@mikro-orm/decorators/legacy'

/**
 * Signing key material for the OP's JWKS.
 */
@Entity()
export class OidcSigningKey extends CustomBaseEntity {
  @Property({ nullable: false, type: 'string' })
  @Unique()
  public kid!: string

  @Property({ nullable: false, type: 'string' })
  @Index()
  public alg!: string

  // TODO: setup encryption (encryption at-rest in DB as a rule, other options) for this value.
  @Property({ nullable: false, type: 'json' })
  public jwk!: Record<string, unknown>

  @Property({ nullable: true, type: 'datetime' })
  @Index()
  public retiredAt?: Date | null

  public constructor(partial?: Partial<OidcSigningKey>) {
    super()
    Object.assign(this, partial)
  }
}
