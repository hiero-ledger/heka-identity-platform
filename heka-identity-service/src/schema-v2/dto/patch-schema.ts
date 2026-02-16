import { ApiProperty } from '@nestjs/swagger'
import { Transform } from 'class-transformer'
import { IsBoolean, IsHexColor, IsOptional, ValidateIf } from 'class-validator'

import { ToBooleanTransformer, ToNullTransformer } from '../../utils/transformation'

import { Schema } from './common/schema'

export class PatchSchemaRequest {
  @ApiProperty({ description: 'Logo', format: 'binary', required: false })
  @IsOptional()
  public readonly logo?: string

  @ApiProperty({ description: 'Background color (HEX RGB)', example: 'ffffff', required: false })
  @IsOptional()
  @IsHexColor()
  @ValidateIf((value) => value.bgColor)
  public readonly bgColor?: string

  @ApiProperty({ description: 'Previous scheme id (null for first)', required: false })
  @IsOptional()
  @Transform(ToNullTransformer)
  public readonly previousSchemaId?: string | null

  @ApiProperty({ description: 'Hidden', required: false, type: Boolean })
  @Transform(ToBooleanTransformer)
  @IsOptional()
  @IsBoolean()
  @ValidateIf((value) => value.isHidden)
  public readonly isHidden?: boolean

  public constructor(partial?: Partial<PatchSchemaRequest>) {
    Object.assign(this, partial)
  }
}

export class PatchSchemaResponse extends Schema {
  public constructor(partial?: Partial<PatchSchemaResponse>) {
    super(partial)
    Object.assign(this, partial)
  }
}
