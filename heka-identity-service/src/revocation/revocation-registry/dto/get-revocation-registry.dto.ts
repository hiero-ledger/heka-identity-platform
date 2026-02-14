import { ApiProperty } from '@nestjs/swagger'

export class GetRevocationRegistryResponse {
  @ApiProperty()
  public timestamp!: number

  @ApiProperty()
  public revocationStatusList!: Array<number>
}
