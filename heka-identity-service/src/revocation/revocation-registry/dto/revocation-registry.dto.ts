import { ApiProperty } from '@nestjs/swagger'

export class RevocationRegistry {
  @ApiProperty()
  public revocationRegistryDefinitionId!: string

  @ApiProperty()
  public index!: number

  @ApiProperty()
  public maximumCredentialNumber!: number

  public constructor(options: RevocationRegistry) {
    this.revocationRegistryDefinitionId = options.revocationRegistryDefinitionId
    this.index = options.index
    this.maximumCredentialNumber = options.maximumCredentialNumber
  }
}
