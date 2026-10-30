import { ApiProperty } from '@nestjs/swagger'
import { IsNotEmpty, IsString, IsUUID, MaxLength } from 'class-validator'

/**
 * Body for `POST /v2/gpg-challenge/verify`.
 * The signature must be a cleartext-signed message from `gpg --clearsign`.
 */
export class VerifySignatureDto {
  @ApiProperty({
    description: 'Id of the active challenge, as returned by POST /v2/gpg-challenge/request.',
    example: 'd290f1ee-6c54-4b01-90e6-d701748f0851',
  })
  @IsUUID('4', { message: 'challengeId must be a valid UUID v4.' })
  public challengeId!: string

  @ApiProperty({
    description:
      'PGP cleartext-signed message produced by `echo "<nonce>" | gpg --clearsign`, including the BEGIN/END headers.',
  })
  @IsString()
  @IsNotEmpty({ message: 'signature must not be empty.' })
  @MaxLength(65_536, { message: 'signature must not exceed 64 KiB.' })
  public signature!: string
}
