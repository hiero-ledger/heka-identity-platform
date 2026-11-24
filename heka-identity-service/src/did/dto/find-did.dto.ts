import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Transform } from 'class-transformer'
import { IsBoolean, IsDefined, IsOptional, IsString } from 'class-validator'

import { ToBooleanTransformer } from 'utils/transformation'

export class FindDidRequestDto {
  @ApiProperty({ type: Boolean })
  @IsDefined()
  @IsBoolean()
  public own!: boolean

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  public method?: string

  @ApiPropertyOptional({
    type: Boolean,
    default: false,
    description: 'Also list DIDs the wallet deactivated (marked with `deactivated: true`)',
  })
  @IsOptional()
  @Transform(ToBooleanTransformer)
  @IsBoolean()
  public includeDeactivated?: boolean
}
