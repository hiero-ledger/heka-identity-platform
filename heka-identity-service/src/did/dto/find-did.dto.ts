import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsBoolean, IsDefined, IsOptional, IsString } from 'class-validator'

export class FindDidRequestDto {
  @ApiProperty({ type: Boolean })
  @IsDefined()
  @IsBoolean()
  public own!: boolean

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  public method?: string
}
