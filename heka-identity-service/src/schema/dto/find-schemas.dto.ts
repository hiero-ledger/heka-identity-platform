import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsOptional, IsString } from 'class-validator'

export class FindSchemasDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  public method?: string
}
