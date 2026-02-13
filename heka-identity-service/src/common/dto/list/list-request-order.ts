import { ApiProperty } from '@nestjs/swagger'
import { IsEnum, IsOptional, MaxLength, MinLength } from 'class-validator'

export enum ListRequestOrderDirection {
  asc = 'asc',
  desc = 'desc',
}

export class ListRequestOrder {
  @ApiProperty({ description: 'Column name' })
  @MinLength(1)
  @MaxLength(100)
  public readonly column!: string

  @ApiProperty({ description: 'Direction', nullable: true })
  @IsEnum(ListRequestOrderDirection)
  @IsOptional()
  public readonly direction?: ListRequestOrderDirection
}
