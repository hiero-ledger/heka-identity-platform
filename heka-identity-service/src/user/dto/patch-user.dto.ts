import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsEnum, IsHexColor, IsNotEmpty, IsOptional, IsString, ValidateIf } from 'class-validator'

import { MessageDeliveryType } from 'common/entities/user.entity'

export class PatchUserDto {
  @ApiPropertyOptional()
  @IsEnum(MessageDeliveryType)
  @IsOptional()
  public readonly messageDeliveryType?: MessageDeliveryType

  @ApiPropertyOptional()
  @ValidateIf((obj) => obj.messageDeliveryType === MessageDeliveryType.WebHook)
  @IsString()
  @IsNotEmpty()
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
