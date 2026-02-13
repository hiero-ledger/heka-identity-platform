import { ApiProperty } from '@nestjs/swagger'
import { Transform } from 'class-transformer'
import { IsBoolean, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator'

import { ListRequest, ListResponse } from '../../common/dto'
import { ToBooleanTransformer } from '../../utils/transformation'

import { Schema } from './common/schema'

export class GetSchemasListRequest extends ListRequest {
  @ApiProperty({ description: 'Search text', required: false })
  @IsString()
  @IsOptional()
  @MaxLength(50)
  public readonly text?: string

  @ApiProperty({ description: 'Is hidden', required: false, nullable: true, type: 'boolean' })
  @Transform(ToBooleanTransformer)
  @IsOptional()
  @IsBoolean()
  @ValidateIf((value) => value.isHidden)
  public readonly isHidden?: boolean

  public constructor(partial?: Partial<GetSchemasListRequest>) {
    super()
    Object.assign(this, partial)
  }
}

export class GetSchemasListResponse extends ListResponse<GetSchemasListItem> {}

export class GetSchemasListItem extends Schema {}
