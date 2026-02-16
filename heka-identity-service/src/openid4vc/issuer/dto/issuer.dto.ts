import type {
  OpenId4VcIssuerRecord as CredoOpenId4VcIssuerRecord,
  OpenId4VciCredentialIssuerMetadataDisplay,
} from '@credo-ts/openid4vc'

import { PublicJwk } from '@credo-ts/core/build/modules/kms'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

import { OpenId4VciCredentialConfigurationSupportedWithId } from './common'

export type PublicIssuerId = string

export class OpenId4VcIssuerRecordDto {
  @ApiProperty()
  public id!: PublicIssuerId

  @ApiProperty()
  public createdAt!: Date

  @ApiPropertyOptional()
  public updatedAt?: Date

  @ApiProperty()
  public type!: string

  @ApiProperty()
  public publicIssuerId!: string

  @ApiProperty()
  public accessTokenPublicKeyFingerprint!: string

  @ApiProperty()
  public credentialsSupported!: OpenId4VciCredentialConfigurationSupportedWithId[]

  @ApiPropertyOptional()
  public display?: OpenId4VciCredentialIssuerMetadataDisplay[]

  public constructor(params: OpenId4VcIssuerRecordDto) {
    this.id = params.id
    this.publicIssuerId = params.publicIssuerId
    this.accessTokenPublicKeyFingerprint = params.accessTokenPublicKeyFingerprint
    this.credentialsSupported = params.credentialsSupported
    this.display = params.display
    this.type = params.type
    this.createdAt = params.createdAt
    this.updatedAt = params.updatedAt
  }

  public static fromOpenIdVcIssuerRecord(record: CredoOpenId4VcIssuerRecord): OpenId4VcIssuerRecordDto {
    return new OpenId4VcIssuerRecordDto({
      ...record,
      credentialsSupported: Object.entries(record.credentialConfigurationsSupported).map(
        ([configurationId, credentialConfiguration]) =>
          OpenId4VciCredentialConfigurationSupportedWithId.fromOpenIdVcCredentialSupportedWithId({
            id: configurationId,
            ...credentialConfiguration,
          }),
      ),
      publicIssuerId: record.issuerId,
      accessTokenPublicKeyFingerprint: record.accessTokenPublicJwk
        ? PublicJwk.fromPublicJwk(record.accessTokenPublicJwk).fingerprint
        : '',
    })
  }
}
