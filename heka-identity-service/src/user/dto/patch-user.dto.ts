import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsEnum, IsHexColor, IsOptional, IsString, IsUrl, ValidateIf } from 'class-validator'

import { MessageDeliveryType } from 'common/entities/user.entity'

export class PatchUserDto {
  @ApiPropertyOptional()
  @IsEnum(MessageDeliveryType)
  @IsOptional()
  public readonly messageDeliveryType?: MessageDeliveryType

  @ApiPropertyOptional()
  @ValidateIf((obj) => obj.messageDeliveryType === MessageDeliveryType.WebHook)
  @IsUrl({ protocols: ['https'], require_protocol: true, require_tls: true },
    { message: 'webHook must be a valid HTTPS URL' })
  public readonly webHook?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  public readonly name?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsHexColor()
  public readonly backgroundColor?: string

  @ApiPropertyOptional({ type: 'string', format: 'binary', required: false })
  @IsOptional()
  public readonly logo?: Express.Multer.File | string
}
