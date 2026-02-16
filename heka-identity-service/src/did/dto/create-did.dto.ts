import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsOptional, IsString } from 'class-validator'

export class CreateDidRequestDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  public method?: string
}
