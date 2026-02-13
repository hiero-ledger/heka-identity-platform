import { CredentialState } from '@credo-ts/didcomm'
import { OpenId4VcIssuanceSessionState } from '@credo-ts/openid4vc/build/openid4vc-issuer/OpenId4VcIssuanceSessionState'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsNotEmpty, IsOptional, IsString, IsUUID, ValidateNested } from 'class-validator'

export type CredentialIssuanceState = OpenId4VcIssuanceSessionState | CredentialState

export class CredentialValue {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  public name!: string

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  public value!: string
}

export class OfferByIssuanceTemplateRequest {
  @ApiProperty({ description: 'ID of issuance template' })
  @IsNotEmpty()
  @IsUUID()
  public templateId!: string

  @ApiPropertyOptional({ description: 'Wallet connection id. Only for Aries protocol type credentials.' })
  @IsString()
  @IsOptional()
  public connectionId?: string

  @ApiProperty({ description: 'Set of credentials', type: [CredentialValue] })
  @ValidateNested({ each: true })
  @Type(() => CredentialValue)
  public credentials!: CredentialValue[]

  @ApiProperty({ description: 'Comments for credentials' })
  @IsOptional()
  @IsString()
  public comment?: string

  public constructor(partial?: Partial<OfferByIssuanceTemplateRequest>) {
    Object.assign(this, partial)
  }
}

export class OfferByIssuanceTemplateResponse {
  @ApiProperty({ description: 'Identifier of issuance session' })
  public id!: string

  @ApiPropertyOptional({ description: 'Link to credential offer. For OpenId4VC protocol' })
  public offer?: string

  @ApiPropertyOptional({
    description: 'State of issued credential',
    oneOf: [
      { type: 'string', enum: Object.values(OpenId4VcIssuanceSessionState) },
      { type: 'string', enum: Object.values(CredentialState) },
    ],
  })
  public state!: CredentialIssuanceState

  public constructor(partial?: Partial<OfferByIssuanceTemplateRequest>) {
    Object.assign(this, partial)
  }
}
