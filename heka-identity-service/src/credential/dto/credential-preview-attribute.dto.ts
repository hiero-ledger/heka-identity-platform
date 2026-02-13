import { ApiProperty } from '@nestjs/swagger'
import { IsNotEmpty, IsString } from 'class-validator'

export interface CredentialPreviewAttributeDtoOptions {
  name: string
  value: string
}

export class CredentialPreviewAttributeDto {
  public constructor(options?: CredentialPreviewAttributeDtoOptions) {
    if (options) {
      this.name = options.name
      this.value = options.value
    }
  }

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  public name!: string

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  public value!: string
}
