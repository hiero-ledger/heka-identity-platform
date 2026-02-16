import { SingleOrArray } from '@credo-ts/core'
import { ApiProperty } from '@nestjs/swagger'

export interface DidDocumentServiceDtoOptions {
  id: string
  serviceEndpoint: SingleOrArray<string | Record<string, unknown>>
  type: string
}

export class DidDocumentServiceDto {
  @ApiProperty()
  public id: string

  @ApiProperty()
  public serviceEndpoint: SingleOrArray<string | Record<string, unknown>>

  @ApiProperty()
  public type: string

  public constructor(options: DidDocumentServiceDtoOptions) {
    this.id = options.id
    this.serviceEndpoint = options.serviceEndpoint
    this.type = options.type
  }
}
