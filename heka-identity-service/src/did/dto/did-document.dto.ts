import { ApiProperty, ApiPropertyOptional, getSchemaPath } from '@nestjs/swagger'

import { DidDocumentServiceDto, DidDocumentServiceDtoOptions } from './did-document-service.dto'
import { VerificationMethodDto, VerificationMethodDtoOptions } from './verification-method.dto'

export interface DidDocumentDtoOptions {
  context: string | string[]
  id: string
  alsoKnownAs?: string[]
  controller?: string | string[]
  verificationMethod?: VerificationMethodDtoOptions[]
  service?: DidDocumentServiceDtoOptions[]
  authentication?: Array<string | VerificationMethodDtoOptions>
  assertionMethod?: Array<string | VerificationMethodDtoOptions>
  keyAgreement?: Array<string | VerificationMethodDtoOptions>
  capabilityInvocation?: Array<string | VerificationMethodDtoOptions>
  capabilityDelegation?: Array<string | VerificationMethodDtoOptions>
}

export class DidDocumentDto {
  @ApiProperty({
    oneOf: [
      { type: 'string' },
      {
        type: 'array',
        items: {
          type: 'string',
        },
      },
    ],
  })
  public context: string | string[]

  @ApiProperty()
  public id: string

  @ApiPropertyOptional({ type: Array<'string'> })
  public alsoKnownAs?: string[]

  @ApiPropertyOptional({
    oneOf: [
      { type: 'string' },
      {
        type: 'array',
        items: {
          type: 'string',
        },
      },
    ],
  })
  public controller?: string | string[]

  @ApiPropertyOptional({ type: [VerificationMethodDto] })
  public verificationMethod?: VerificationMethodDto[]

  @ApiPropertyOptional({ type: [DidDocumentServiceDto] })
  public service?: DidDocumentServiceDto[]

  @ApiPropertyOptional({
    type: 'array',
    items: {
      oneOf: [{ type: 'string' }, { $ref: getSchemaPath(VerificationMethodDto) }],
    },
  })
  public authentication?: Array<string | VerificationMethodDto>

  @ApiPropertyOptional({
    type: 'array',
    items: {
      oneOf: [{ type: 'string' }, { $ref: getSchemaPath(VerificationMethodDto) }],
    },
  })
  public assertionMethod?: Array<string | VerificationMethodDto>

  @ApiPropertyOptional({
    type: 'array',
    items: {
      oneOf: [{ type: 'string' }, { $ref: getSchemaPath(VerificationMethodDto) }],
    },
  })
  public keyAgreement?: Array<string | VerificationMethodDto>

  @ApiPropertyOptional({
    type: 'array',
    items: {
      oneOf: [{ type: 'string' }, { $ref: getSchemaPath(VerificationMethodDto) }],
    },
  })
  public capabilityInvocation?: Array<string | VerificationMethodDto>

  @ApiPropertyOptional({
    type: 'array',
    items: {
      oneOf: [{ type: 'string' }, { $ref: getSchemaPath(VerificationMethodDto) }],
    },
  })
  public capabilityDelegation?: Array<string | VerificationMethodDto>

  public constructor(options: DidDocumentDtoOptions) {
    this.context = options.context
    this.id = options.id
    this.alsoKnownAs = options.alsoKnownAs
    this.controller = options.controller
    this.verificationMethod = options.verificationMethod?.map((value) => new VerificationMethodDto(value))
    this.service = options.service?.map((value) => new DidDocumentServiceDto(value))
    this.authentication = options.authentication?.map(convertUnionVerificationMethod)
    this.assertionMethod = options.assertionMethod?.map(convertUnionVerificationMethod)
    this.keyAgreement = options.keyAgreement?.map(convertUnionVerificationMethod)
    this.capabilityInvocation = options.capabilityInvocation?.map(convertUnionVerificationMethod)
    this.capabilityDelegation = options.capabilityDelegation?.map(convertUnionVerificationMethod)
  }
}

function convertUnionVerificationMethod(value: string | VerificationMethodDtoOptions): string | VerificationMethodDto {
  return typeof value === 'string' ? value : new VerificationMethodDto(value)
}
