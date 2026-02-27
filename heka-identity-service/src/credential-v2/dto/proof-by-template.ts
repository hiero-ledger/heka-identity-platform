import { DidCommProofState, DidCommCredentialState } from '@credo-ts/didcomm'
import { OpenId4VcVerificationSessionState } from '@credo-ts/openid4vc'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator'

import { CredentialValue } from 'credential-v2/dto/offer-by-template'

export type CredentialProofState = OpenId4VcVerificationSessionState | DidCommProofState

export class ProofByVerificationTemplateRequest {
  @ApiProperty({ description: 'ID of issuance template' })
  @IsNotEmpty()
  @IsUUID()
  public templateId!: string

  @ApiPropertyOptional({ description: 'Wallet connection id. Only for Aries protocol type credentials.' })
  @IsString()
  @IsOptional()
  public connectionId?: string

  @ApiProperty({ description: 'Set of requested fields', type: [CredentialValue] })
  @IsNotEmpty()
  public fields!: string[]

  @ApiProperty({ description: 'Comments for credentials' })
  @IsOptional()
  @IsString()
  public comment?: string

  public constructor(partial?: Partial<ProofByVerificationTemplateRequest>) {
    Object.assign(this, partial)
  }
}

export class ProofByVerificationTemplateResponse {
  @ApiProperty({ description: 'Identifier of issuance session' })
  public id!: string

  @ApiPropertyOptional({ description: 'Authorization request link. For OpenId4VC protocol' })
  public request?: string

  @ApiPropertyOptional({
    description: 'State of verification of credential',
    oneOf: [
      { type: 'string', enum: Object.values(OpenId4VcVerificationSessionState) },
      { type: 'string', enum: Object.values(DidCommCredentialState) },
    ],
  })
  public state!: CredentialProofState

  public constructor(partial?: Partial<ProofByVerificationTemplateRequest>) {
    Object.assign(this, partial)
  }
}
