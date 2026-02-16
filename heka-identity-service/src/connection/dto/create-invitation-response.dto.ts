import { ApiProperty } from '@nestjs/swagger'

export class CreateInvitationResponseDto {
  @ApiProperty()
  public id: string

  @ApiProperty()
  public invitationUrl: string

  public constructor(id: string, invitationUrl: string) {
    this.invitationUrl = invitationUrl
    this.id = id
  }
}
