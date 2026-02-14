import { ApiProperty } from '@nestjs/swagger'
import { IsEnum, IsNumber, IsOptional, IsString } from 'class-validator'

import { StatusListPurpose } from '../../../common/entities/credential-status-list.entity'

export class CreateStatusListRequest {
  @ApiProperty()
  @IsString()
  public issuer!: string

  @ApiProperty()
  @IsOptional()
  @IsNumber()
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
