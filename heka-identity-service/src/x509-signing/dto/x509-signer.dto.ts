import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsBoolean, IsIn, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator'

import { X509ClientIdPrefix, X509Signer } from '../x509-signer.types'

export class ProvisionX509SignerDto {
  @ApiPropertyOptional({ enum: ['x509_hash', 'x509_san_dns'], default: 'x509_hash' })
  @IsOptional()
  @IsIn(['x509_hash', 'x509_san_dns'])
  public clientIdPrefix?: X509ClientIdPrefix

  @ApiPropertyOptional({ description: 'Certificate subject/issuer common name.' })
  @IsOptional()
  @IsString()
  public commonName?: string

  @ApiPropertyOptional({ description: 'SAN dNSName; required for the x509_san_dns trust model.' })
  @IsOptional()
  @IsString()
  public sanDnsName?: string

  @ApiPropertyOptional({ default: true, description: 'Also create a did:jwk bound to the same key.' })
  @IsOptional()
  @IsBoolean()
  public alsoCreateDid?: boolean

  @ApiPropertyOptional({ default: true, description: 'Mark as the default for its clientIdPrefix.' })
  @IsOptional()
  @IsBoolean()
  public makeDefault?: boolean

  @ApiPropertyOptional({ default: 365, description: 'Certificate validity in days.' })
  @IsOptional()
  @IsNumber()
  public validityDays?: number
}

export class X509SignerDto {
  @ApiProperty()
  public id!: string

  @ApiProperty({ enum: ['x509_hash', 'x509_san_dns'] })
  public clientIdPrefix!: X509ClientIdPrefix

  @ApiProperty({ description: 'Hex SHA-256 thumbprint of the leaf certificate.' })
  public fingerprint!: string

  @ApiProperty({ description: 'Base64 DER certificate — register this in the wallet request-signer trust set.' })
  public certificateBase64!: string

  @ApiPropertyOptional({ description: 'did:jwk projection of the same key.' })
  public did?: string

  @ApiPropertyOptional({ description: 'Certificate subject/issuer common name.' })
  public commonName?: string

  @ApiPropertyOptional()
  public sanDnsName?: string

  @ApiProperty()
  public isDefault!: boolean

  @ApiProperty()
  public createdAt!: string

  @ApiProperty()
  public notAfter!: string

  @ApiProperty({ description: 'Whole days until the certificate expires (negative once expired).' })
  public expiresInDays!: number

  @ApiProperty({ description: 'True once the certificate is past its notAfter — rotate to restore signing.' })
  public expired!: boolean

  // The KMS keyId is intentionally NOT exposed — it is an internal Askar handle.
  public static fromSigner(identity: X509Signer): X509SignerDto {
    const dto = new X509SignerDto()
    dto.id = identity.id
    dto.clientIdPrefix = identity.clientIdPrefix
    dto.fingerprint = identity.fingerprint
    dto.certificateBase64 = identity.certificateBase64
    dto.did = identity.did
    dto.commonName = identity.commonName
    dto.sanDnsName = identity.sanDnsName
    dto.isDefault = identity.isDefault
    dto.createdAt = identity.createdAt
    dto.notAfter = identity.notAfter

    const msUntilExpiry = new Date(identity.notAfter).getTime() - Date.now()
    dto.expiresInDays = Math.floor(msUntilExpiry / (24 * 60 * 60 * 1000))
    dto.expired = msUntilExpiry <= 0
    return dto
  }
}

export class X509RootCertificateDto {
  @ApiProperty({
    description: 'Base64 DER root CA certificate — register as the wallet trust anchor for x509_san_dns.',
  })
  public certificateBase64!: string

  @ApiProperty({ description: 'Hex SHA-256 thumbprint of the root CA certificate.' })
  public fingerprint!: string
}

export class CreateX509CsrDto {
  @ApiPropertyOptional({ description: 'SAN dNSName for the leaf (the verifier domain).' })
  @IsOptional()
  @IsString()
  public sanDnsName?: string

  @ApiPropertyOptional({ description: 'Certificate subject common name.' })
  @IsOptional()
  @IsString()
  public commonName?: string
}

export class X509CsrDto {
  @ApiProperty({ description: 'KMS key id — pass back to /import to bind the CA-signed certificate.' })
  public keyId!: string

  @ApiProperty({ description: 'PEM-encoded certificate signing request to submit to your CA.' })
  public csrPem!: string
}

export class ImportSignedCertificateDto {
  @ApiProperty({ description: 'keyId returned by /csr.' })
  @IsString()
  @IsNotEmpty()
  public keyId!: string

  @ApiProperty({ description: 'The CA-signed leaf certificate (PEM or base64 DER).' })
  @IsString()
  @IsNotEmpty()
  public certificate!: string

  @ApiPropertyOptional({ enum: ['x509_hash', 'x509_san_dns'], default: 'x509_san_dns' })
  @IsOptional()
  @IsIn(['x509_hash', 'x509_san_dns'])
  public clientIdPrefix?: X509ClientIdPrefix

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  public sanDnsName?: string

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  public makeDefault?: boolean
}

export class RotateX509SignerDto {
  @ApiPropertyOptional({ default: 365, description: 'Validity in days for the reissued certificate.' })
  @IsOptional()
  @IsNumber()
  public validityDays?: number
}
