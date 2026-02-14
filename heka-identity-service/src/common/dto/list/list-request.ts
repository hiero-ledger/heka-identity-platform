import { ApiProperty } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsOptional, Max, Min, ValidateNested } from 'class-validator'

import { ListRequestOrder } from './list-request-order'

export class ListRequest {
  @ApiProperty({ description: 'Page offset', required: false })
  @IsOptional()
  @Min(0)
  @Max(65535)
  public readonly offset?: number

  @ApiProperty({ description: 'Page size', required: false })
  @IsOptional()
  @Min(1)
  @Max(500)
  public readonly limit?: number

  public constructor(partial?: Partial<ListRequest>) {
    Object.assign(this, partial)
  }
}

export class OrderedListRequest extends ListRequest {
  @ApiProperty({ description: 'Order definition', required: false })
  @ValidateNested({ each: true })
  @Type(() => ListRequestOrder)
  public readonly order?: ListRequestOrder[]

  public constructor(partial?: Partial<OrderedListRequest>) {
    super()
    Object.assign(this, partial)
  }
}
