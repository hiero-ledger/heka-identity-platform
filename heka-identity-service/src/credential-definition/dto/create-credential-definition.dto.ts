import { ApiProperty } from '@nestjs/swagger'
import { IsNotEmpty, IsString } from 'class-validator'

export class CreateCredentialDefinitionDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  public issuerId!: string

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  public schemaId!: string

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  public tag!: string
}
