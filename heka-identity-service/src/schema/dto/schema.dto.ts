import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export interface SchemaDtoOptions {
  id: string
  issuerId: string
  name: string
  version: string
  attrNames?: string[]
  json?: Record<string, unknown>
}

export class SchemaDto {
  @ApiProperty()
  public id: string

  @ApiProperty()
  public issuerId: string

  @ApiProperty()
  public name: string

  @ApiProperty()
  public version: string

  @ApiPropertyOptional()
  public attrNames?: string[]

  @ApiPropertyOptional()
  public json?: Record<string, unknown>

  public constructor(options: SchemaDtoOptions) {
    this.id = options.id
    this.issuerId = options.issuerId
    this.name = options.name
    this.version = options.version
    this.attrNames = options.attrNames
    this.json = options.json
  }
}
