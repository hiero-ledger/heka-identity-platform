import { ApiProperty } from '@nestjs/swagger'
import { IsArray, IsBoolean } from 'class-validator'

export class UpdateStatusListRequest {
  @ApiProperty({ type: [Number] })
  @IsArray()
  public indexes!: Array<number>

  @ApiProperty()
  @IsBoolean()
  public revoked!: boolean
}
