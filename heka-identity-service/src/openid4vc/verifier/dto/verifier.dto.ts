import { OpenId4VcVerifierRecord } from '@credo-ts/openid4vc'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsDate, IsNotEmpty, IsOptional, IsString } from 'class-validator'

export type PublicVerifierId = string

export class OpenId4VcVerifierRecordDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  public id!: PublicVerifierId

  @ApiProperty()
  @IsDate()
  public createdAt!: Date

  @ApiPropertyOptional()
  @IsOptional()
  @IsDate()
  public updatedAt?: Date

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  public type!: string

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  public publicVerifierId!: string

  public constructor(params: OpenId4VcVerifierRecordDto) {
    this.id = params.id
    this.publicVerifierId = params.publicVerifierId
    this.type = params.type
    this.createdAt = params.createdAt
    this.updatedAt = params.updatedAt
  }

  public static fromOpenId4VcVerifierRecord(record: OpenId4VcVerifierRecord): OpenId4VcVerifierRecordDto {
    return new OpenId4VcVerifierRecordDto({
      ...record,
      publicVerifierId: record.verifierId,
    })
  }
}
