import { DidCommCredentialRole, DidCommCredentialState } from '@credo-ts/didcomm'
import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsEnum, IsOptional, IsString } from 'class-validator'

export class GetCredentialsQueryDto {
  @ApiPropertyOptional({ description: 'DIDComm thread id of the credential exchange' })
  @IsOptional()
  @IsString()
  public threadId?: string

  @ApiPropertyOptional({
    enum: DidCommCredentialRole,
    description: 'Role of this wallet in the exchange: `issuer` lists credentials issued by this wallet',
  })
  @IsOptional()
  @IsEnum(DidCommCredentialRole)
  public role?: DidCommCredentialRole

  @ApiPropertyOptional({ enum: DidCommCredentialState, description: 'State of the credential exchange' })
  @IsOptional()
  @IsEnum(DidCommCredentialState)
  public state?: DidCommCredentialState
}
