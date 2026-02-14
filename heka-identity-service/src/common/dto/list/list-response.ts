import { ApiProperty } from '@nestjs/swagger'

export class ListResponse<T> {
  @ApiProperty({ description: 'Data offset' })
  public readonly offset!: number

  @ApiProperty({ description: 'Data page size' })
  public readonly limit!: number

  @ApiProperty({ description: 'Total items count' })
  public readonly total!: number

  @ApiProperty({ description: 'Data items', isArray: true })
  public readonly items!: T[]

  public constructor(partial?: Partial<ListResponse<T>>) {
    Object.assign(this, partial)
  }
}
