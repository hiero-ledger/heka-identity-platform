import { Entity, ManyToOne, Property } from '@mikro-orm/decorators/legacy'

import { Identified } from './identified.entity'
import { User } from './user.entity'

/**
 * Header material naming the list's signing key — the credential-signing key (see `TokenStatusListService`):
 * the `x5c` chain of an X.509 issuer, or the `kid` (DID URL) of a DID issuer.
 */
export type TokenStatusListSigner = { method: 'x5c'; x5c: string[] } | { method: 'did'; kid: string }

/** Entries per list. Large lists give herd privacy (draft-ietf-oauth-status-list §11). */
export const defaultTokenStatusListSize = 100_000
/** 1 bit = valid / invalid. 2 bits would add `suspended`. */
export const defaultTokenStatusListBits = 1

interface TokenStatusListProps {
  id?: string
  issuer: string
  signerKeyId: string
  tenantContextId: string
  signer: TokenStatusListSigner
  bitsPerStatus?: number
  size?: number
  allocatedBitmap: string
  encodedStatuses: string
  owner: User
}

/**
 * An IETF Token Status List (draft-ietf-oauth-status-list) referenced by SD-JWT VCs through their
 * `status.status_list` claim. One list per (owner, signing key), keyed by `signerKeyId`, so it outlives
 * certificate renewal (the key is kept — see `ManagedCertificateService`).
 *
 * App-DB entity rather than an Askar record: the public download route resolves a list by id with no
 * tenant context.
 */
@Entity()
export class TokenStatusList extends Identified {
  /** `iss` of the referenced credentials (a DID or the https issuer URL). */
  @Property({ nullable: false, type: 'string' })
  public issuer: string

  /** KMS key id (owning tenant's store) that signs this list. */
  @Property({ nullable: false, type: 'string' })
  public signerKeyId: string

  /** Tenant context that holds `signerKeyId` — the only context the list can be re-signed in. */
  @Property({ nullable: false, type: 'string' })
  public tenantContextId: string

  @Property({ nullable: false, type: 'json' })
  public signer: TokenStatusListSigner

  @Property({ nullable: false, type: 'number' })
  public bitsPerStatus: number

  @Property({ nullable: false, type: 'number' })
  public size: number

  @Property({ nullable: false, type: 'number' })
  public allocatedCount: number

  /** Base64 bitmap of the indexes handed out to credentials. */
  @Property({ nullable: false, type: 'text' })
  public allocatedBitmap: string

  /** The compressed status array as base64url — the token's `lst` value. */
  @Property({ nullable: false, type: 'text' })
  public encodedStatuses: string

  /** The last signed Status List Token (`statuslist+jwt`), served verbatim by the public route. */
  @Property({ nullable: true, type: 'text' })
  public token: string | null = null

  @Property({ nullable: true, type: 'Date' })
  public tokenIssuedAt: Date | null = null

  @ManyToOne(() => User, { nullable: false, lazy: true })
  public owner!: User

  public constructor(props: TokenStatusListProps) {
    super(props)
    this.issuer = props.issuer
    this.signerKeyId = props.signerKeyId
    this.tenantContextId = props.tenantContextId
    this.signer = props.signer
    this.bitsPerStatus = props.bitsPerStatus ?? defaultTokenStatusListBits
    this.size = props.size ?? defaultTokenStatusListSize
    this.allocatedCount = 0
    this.allocatedBitmap = props.allocatedBitmap
    this.encodedStatuses = props.encodedStatuses
    this.owner = props.owner
  }
}
