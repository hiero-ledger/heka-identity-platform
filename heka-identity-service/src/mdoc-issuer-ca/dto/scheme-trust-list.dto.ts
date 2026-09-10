import { ApiProperty } from '@nestjs/swagger'

export class SchemeTrustListEntryDto {
  @ApiProperty({ description: 'List id (path segment under /trust-list)', example: 'eaa-providers' })
  public id!: string

  @ApiProperty({ description: 'TS 119 602 LoTEType URI of the list' })
  public loteType!: string

  @ApiProperty({ description: 'Relative location of the signed list', example: '/trust-list/eaa-providers' })
  public path!: string

  @ApiProperty({ description: 'Media type of the signed list', example: 'application/trustlist+jwt' })
  public mimeType!: string
}

export class TrustListPointerDto {
  @ApiProperty({ description: 'Absolute location of an external list (e.g. a Commission LoTE)' })
  public location!: string

  @ApiProperty({ description: 'LoTEType URI of the pointed list, when known', required: false })
  public loteType?: string

  @ApiProperty({ description: 'Scheme operator of the pointed list, when known', required: false })
  public schemeOperatorName?: string

  @ApiProperty({
    description: 'Base64 DER certificates the pointed list must be signed by (the consumer pins these)',
    isArray: true,
    type: String,
  })
  public signerCertificates!: string[]
}

export class SchemeTrustListIndexDto {
  @ApiProperty({ description: 'Scheme operator name (the entity vouching for the listed anchors)' })
  public schemeOperator!: string

  @ApiProperty({
    description: 'The signed scheme lists served by this service',
    isArray: true,
    type: SchemeTrustListEntryDto,
  })
  public lists!: SchemeTrustListEntryDto[]

  @ApiProperty({
    description: 'Discovery pointers to external lists this scheme recommends consuming directly',
    isArray: true,
    type: TrustListPointerDto,
  })
  public pointers!: TrustListPointerDto[]
}
