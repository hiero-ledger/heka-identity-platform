import { ApiProperty, getSchemaPath } from '@nestjs/swagger'

export class DidMethodCapabilitiesDto {
  @ApiProperty({ description: 'A DID of the method can be updated (`PATCH /dids/:did`)' })
  public update!: boolean

  @ApiProperty({ description: 'A DID of the method can be deactivated (`POST /dids/:did/deactivate`)' })
  public deactivate!: boolean

  @ApiProperty({ description: 'A new DID of the method can have another DID as controller' })
  public controller!: boolean
}

export class GetDidMethodsResponseDto {
  @ApiProperty({ type: [String] })
  public methods!: Array<string>

  @ApiProperty({
    type: 'object',
    additionalProperties: { $ref: getSchemaPath(DidMethodCapabilitiesDto) },
    description: 'What the Identity Service can do with DIDs of each configured method',
  })
  public capabilities!: Record<string, DidMethodCapabilitiesDto>

  public constructor(methods: Array<string>, capabilities: Record<string, DidMethodCapabilitiesDto> = {}) {
    this.methods = methods
    this.capabilities = capabilities
  }
}
