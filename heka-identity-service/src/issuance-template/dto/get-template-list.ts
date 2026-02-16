import { ApiProperty } from '@nestjs/swagger'
import { Transform } from 'class-transformer'
import { IsBoolean, IsOptional, IsString, ValidateIf } from 'class-validator'

import { ListRequest, ListResponse } from '../../common/dto'
import { ToBooleanTransformer } from '../../utils/transformation'

import { IssuanceTemplate } from './common/issuance-template'

export class GetIssuanceTemplatesListRequest extends ListRequest {
  @ApiProperty({ description: 'Search text', required: false })
  @IsString()
  @IsOptional()
  public readonly text?: string

  @ApiProperty({ description: 'Is pinned', required: false, nullable: true, type: 'boolean' })
  @Transform(ToBooleanTransformer)
  @IsOptional()
  @IsBoolean()
  @ValidateIf((value) => value.isPinned)
  public readonly isPinned?: boolean

  public constructor(partial?: Partial<GetIssuanceTemplatesListRequest>) {
    super()
    Object.assign(this, partial)
  }
}

export class GetIssuanceTemplatesListResponse extends ListResponse<GetIssuanceTemplatesListItem> {}

export class GetIssuanceTemplatesListItem extends IssuanceTemplate {
  public constructor(partial?: Partial<GetIssuanceTemplatesListItem>) {
    super(partial)
    Object.assign(this, partial)
  }
}
