import { ApiProperty } from '@nestjs/swagger'
import { Transform } from 'class-transformer'
import {
  IsArray,
  ArrayNotEmpty,
  ArrayUnique,
  IsHexColor,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator'

import { TransformToArray, TrimTransformer } from '../../utils/transformation'

import { Schema } from './common/schema'

export class CreateSchemaRequest {
  @ApiProperty({ description: 'Schema name' })
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  @Transform(TrimTransformer)
  public readonly name!: string

  @ApiProperty({ description: 'Logo', format: 'binary', required: false, nullable: true })
  @IsOptional()
  public readonly logo?: string

  @ApiProperty({ description: 'Background color (HEX RGB)', example: 'ffffff', required: false })
  @IsOptional()
  @IsHexColor()
  public readonly bgColor?: string

  @ApiProperty({ description: 'Schema fieldset' })
  @TransformToArray()
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique({ message: "All field's elements must be unique" })
  public fields!: string[]

  public constructor(partial?: Partial<CreateSchemaRequest>) {
    Object.assign(this, partial)
  }
}

export class CreateSchemaResponse extends Schema {
  public constructor(partial?: Partial<CreateSchemaResponse>) {
    super(partial)
    Object.assign(this, partial)
  }
}
