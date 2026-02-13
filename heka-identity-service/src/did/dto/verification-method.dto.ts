import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export interface VerificationMethodDtoOptions {
  id: string
  type: string
  controller: string
  publicKeyBase58?: string
  publicKeyBase64?: string
  publicKeyJwk?: Record<string, unknown>
  publicKeyHex?: string
  publicKeyMultibase?: string
  publicKeyPem?: string
  blockchainAccountId?: string
  ethereumAddress?: string
}

export class VerificationMethodDto {
  @ApiProperty()
  public id: string

  @ApiProperty()
  public type: string

  @ApiProperty()
  public controller: string

  @ApiPropertyOptional()
  public publicKeyBase58?: string

  @ApiPropertyOptional()
  public publicKeyBase64?: string

  @ApiPropertyOptional()
  public publicKeyJwk?: Record<string, unknown>

  @ApiPropertyOptional()
  public publicKeyHex?: string

  @ApiPropertyOptional()
  public publicKeyMultibase?: string

  @ApiPropertyOptional()
  public publicKeyPem?: string

  @ApiPropertyOptional()
  public blockchainAccountId?: string

  @ApiPropertyOptional()
  public ethereumAddress?: string

  public constructor(options: VerificationMethodDtoOptions) {
    this.id = options.id
    this.type = options.type
    this.controller = options.controller
    this.publicKeyBase58 = options.publicKeyBase58
    this.publicKeyBase64 = options.publicKeyBase64
    this.publicKeyJwk = options.publicKeyJwk
    this.publicKeyHex = options.publicKeyHex
    this.publicKeyMultibase = options.publicKeyMultibase
    this.publicKeyPem = options.publicKeyPem
    this.blockchainAccountId = options.blockchainAccountId
    this.ethereumAddress = options.ethereumAddress
  }
}
