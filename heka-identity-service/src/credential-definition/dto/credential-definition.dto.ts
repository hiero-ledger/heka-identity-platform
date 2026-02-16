import { ApiProperty } from '@nestjs/swagger'

export interface CredentialDefinitionDtoOptions {
  id: string
  issuerId: string
  schemaId: string
  tag: string
}

export class CredentialDefinitionDto {
  public constructor(options: CredentialDefinitionDtoOptions) {
    this.id = options.id
    this.issuerId = options.issuerId
    this.schemaId = options.schemaId
    this.tag = options.tag
  }

  @ApiProperty()
  public id: string

  @ApiProperty()
  public issuerId: string

  @ApiProperty()
  public schemaId: string

  @ApiProperty()
  public tag: string
}
