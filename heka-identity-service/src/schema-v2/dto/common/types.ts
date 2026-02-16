import { ApiProperty } from '@nestjs/swagger'

export class AriesCredentials {
  @ApiProperty({ description: 'Aries credential definition id' })
  public readonly credentialDefinitionId!: string

  public constructor(partial?: Partial<AriesCredentials>) {
    Object.assign(this, partial)
  }
}

export class Oid4vcCredentials {
  @ApiProperty({ description: 'OpenId4vc supported credential id' })
  public readonly supportedCredentialId!: string

  public constructor(partial: Partial<Oid4vcCredentials>) {
    Object.assign(this, partial)
  }
}
