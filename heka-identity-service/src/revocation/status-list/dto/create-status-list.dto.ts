import { ApiProperty } from '@nestjs/swagger'
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator'

import {
  defaultCredentialStatusListSize,
  maxCredentialStatusListSize,
  StatusListPurpose,
} from '../../../common/entities/credential-status-list.entity'

export class CreateStatusListRequest {
  @ApiProperty()
  @IsString()
  public issuer!: string

  @ApiProperty({ default: defaultCredentialStatusListSize, minimum: 1, maximum: maxCredentialStatusListSize })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(maxCredentialStatusListSize)
  public size?: number

  @ApiProperty({ enum: StatusListPurpose })
  @IsOptional()
  @IsEnum(StatusListPurpose)
  public purpose?: StatusListPurpose
}

export class CreateStatusListResponse {
  @ApiProperty()
  public id!: string

  public constructor(props: CreateStatusListResponse) {
    this.id = props.id
  }
}
