import { ApiProperty } from '@nestjs/swagger'

export class GetRevocationStatusResponseDto {
  @ApiProperty()
  public revoked!: boolean
}
