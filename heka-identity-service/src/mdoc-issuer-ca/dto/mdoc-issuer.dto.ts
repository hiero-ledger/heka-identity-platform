import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsNumber, IsOptional, IsString, Length } from 'class-validator'

import { MdocDsc, MdocIaca } from '../mdoc-issuer-ca.types'

const MS_PER_DAY = 24 * 60 * 60 * 1000

function expiry(notAfter: string): { expiresInDays: number; expired: boolean } {
  const msUntilExpiry = new Date(notAfter).getTime() - Date.now()
  return { expiresInDays: Math.floor(msUntilExpiry / MS_PER_DAY), expired: msUntilExpiry <= 0 }
}

export class ProvisionIacaDto {
  @ApiPropertyOptional({ description: 'Certificate subject/issuer common name. Defaults to `<authority> mDL IACA`.' })
  @IsOptional()
  @IsString()
  public commonName?: string

  @ApiPropertyOptional({ description: 'ISO 3166-1 alpha-2 country code. Defaults to MDOC_ISSUER_COUNTRY.' })
  @IsOptional()
  @IsString()
  @Length(2, 2)
  public country?: string

  @ApiPropertyOptional({ description: 'Issuing authority name. Defaults to MDOC_ISSUER_AUTHORITY.' })
  @IsOptional()
  @IsString()
  public authorityName?: string

  @ApiPropertyOptional({ description: 'Default mdoc docType. Defaults to MDOC_DEFAULT_DOCTYPE.' })
  @IsOptional()
  @IsString()
  public docType?: string

  @ApiPropertyOptional({ default: 365 * 5, description: 'IACA validity in days (ISO/AAMVA cap ≤9 years).' })
  @IsOptional()
  @IsNumber()
  public validityDays?: number
}

export class MdocIacaDto {
  @ApiProperty()
  public id!: string

  @ApiProperty({ description: 'Hex SHA-256 thumbprint of the IACA certificate.' })
  public fingerprint!: string

  @ApiProperty({ description: 'Base64 DER IACA certificate — the wallet trust anchor (published via the VICAL).' })
  public certificateBase64!: string

  @ApiProperty()
  public commonName!: string

  @ApiProperty({ description: 'ISO 3166-1 alpha-2 country code.' })
  public country!: string

  @ApiProperty({ description: 'Issuing authority name (VICAL issuingAuthority).' })
  public authorityName!: string

  @ApiProperty({ description: 'Default mdoc docType this IACA is authoritative for.' })
  public docType!: string

  @ApiProperty()
  public createdAt!: string

  @ApiProperty()
  public notAfter!: string

  @ApiProperty({ description: 'Whole days until the certificate expires (negative once expired).' })
  public expiresInDays!: number

  @ApiProperty({ description: 'True once the certificate is past its notAfter.' })
  public expired!: boolean

  // The KMS keyId is intentionally NOT exposed — it is an internal Askar handle.
  public static fromIaca(iaca: MdocIaca): MdocIacaDto {
    const dto = new MdocIacaDto()
    dto.id = iaca.id
    dto.fingerprint = iaca.fingerprint
    dto.certificateBase64 = iaca.certificateBase64
    dto.commonName = iaca.commonName
    dto.country = iaca.country
    dto.authorityName = iaca.authorityName
    dto.docType = iaca.docType
    dto.createdAt = iaca.createdAt
    dto.notAfter = iaca.notAfter
    Object.assign(dto, expiry(iaca.notAfter))
    return dto
  }
}

export class MdocDscDto {
  @ApiProperty()
  public id!: string

  @ApiProperty({ description: 'Hex SHA-256 thumbprint of the DSC certificate.' })
  public fingerprint!: string

  @ApiProperty({ description: 'Base64 DER DSC certificate (the leaf placed in the MSO x5chain).' })
  public certificateBase64!: string

  @ApiProperty({ description: 'Id of the IACA that signed this DSC.' })
  public iacaId!: string

  @ApiProperty({ description: 'True for the DSC the issuer currently signs MSOs with.' })
  public isCurrent!: boolean

  @ApiProperty()
  public createdAt!: string

  @ApiProperty()
  public notAfter!: string

  @ApiProperty({ description: 'Whole days until the certificate expires (negative once expired).' })
  public expiresInDays!: number

  @ApiProperty({ description: 'True once the certificate is past its notAfter.' })
  public expired!: boolean

  public static fromDsc(dsc: MdocDsc): MdocDscDto {
    const dto = new MdocDscDto()
    dto.id = dsc.id
    dto.fingerprint = dsc.fingerprint
    dto.certificateBase64 = dsc.certificateBase64
    dto.iacaId = dsc.iacaId
    dto.isCurrent = dsc.isCurrent
    dto.createdAt = dsc.createdAt
    dto.notAfter = dsc.notAfter
    Object.assign(dto, expiry(dsc.notAfter))
    return dto
  }
}

export class MdocIssuerDto {
  @ApiProperty({ type: MdocIacaDto })
  public iaca!: MdocIacaDto

  @ApiProperty({ type: MdocDscDto, isArray: true })
  public dscs!: MdocDscDto[]

  public static from(iaca: MdocIaca, dscs: MdocDsc[]): MdocIssuerDto {
    const dto = new MdocIssuerDto()
    dto.iaca = MdocIacaDto.fromIaca(iaca)
    dto.dscs = dscs.map((dsc) => MdocDscDto.fromDsc(dsc))
    return dto
  }
}
