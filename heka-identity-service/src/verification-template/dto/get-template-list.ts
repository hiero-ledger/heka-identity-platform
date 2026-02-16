import { ApiProperty } from '@nestjs/swagger'
import { Transform } from 'class-transformer'
import { IsBoolean, IsOptional, IsString, ValidateIf } from 'class-validator'

import { ListRequest, ListResponse } from '../../common/dto'
import { ToBooleanTransformer } from '../../utils/transformation'

import { VerificationTemplate } from './common/verification-template'

export class GetVerificationTemplatesListRequest extends ListRequest {
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

  public constructor(partial?: Partial<GetVerificationTemplatesListRequest>) {
    super()
    Object.assign(this, partial)
  }
}

export class GetVerificationTemplatesListResponse extends ListResponse<GetVerificationTemplatesListItem> {}

export class GetVerificationTemplatesListItem extends VerificationTemplate {
  public constructor(partial?: Partial<GetVerificationTemplatesListItem>) {
    super(partial)
    Object.assign(this, partial)
  }
}
