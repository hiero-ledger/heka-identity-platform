import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export class VerifySignatureResponseDto {
  @ApiProperty({ description: 'Whether the signature proved ownership of a key published for the linked account' })
  public verified!: boolean

  @ApiPropertyOptional({ description: 'Fingerprint of the verified key (uppercase hex), when verified' })
  public gpgFingerprint?: string

  @ApiProperty()
  public message!: string
}
