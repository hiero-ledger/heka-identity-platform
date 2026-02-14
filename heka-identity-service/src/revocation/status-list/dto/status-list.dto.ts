import { ApiProperty } from '@nestjs/swagger'

import { StatusListPurpose } from '../../../common/entities/credential-status-list.entity'

export class StatusList {
  @ApiProperty()
  public size: number

  @ApiProperty({ enum: StatusListPurpose })
  public purpose?: StatusListPurpose

  @ApiProperty()
  public encodedList: string

  @ApiProperty()
  public lastIndex: number

  public constructor(props: StatusList) {
    this.size = props.size
    this.purpose = props.purpose
    this.lastIndex = props.lastIndex
    this.encodedList = props.encodedList
  }
}
