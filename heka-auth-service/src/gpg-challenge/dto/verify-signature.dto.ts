import { ApiProperty } from '@nestjs/swagger'
import { IsNotEmpty, IsString, IsUUID, MaxLength } from 'class-validator'

/**
 * Request body for `POST /gpg-challenge/verify`.
 *
 * The caller supplies the `challengeId` returned by the request endpoint and
 * an armored GPG signature produced by signing the challenge nonce with the
 * contributor's private key.
 *
 * The service accepts **cleartext-signed messages only** (produced by
 * `gpg --clearsign`). The entire armored block, including the
 * `-----BEGIN PGP SIGNED MESSAGE-----` and `-----END PGP SIGNATURE-----`
 * headers, must be submitted.
 */
export class VerifySignatureDto {
  @ApiProperty({
    description: 'UUID of the active challenge session, as returned by POST /gpg-challenge/request.',
    example: 'd290f1ee-6c54-4b01-90e6-d701748f0851',
  })
  @IsUUID('4', { message: 'challengeId must be a valid UUID v4.' })
  public challengeId!: string

  @ApiProperty({
    description:
      'PGP-armored cleartext-signed message produced by running:\n' +
      '  echo "<nonce>" | gpg --clearsign\n' +
      'The entire armored block including the BEGIN/END PGP SIGNED MESSAGE ' +
      'headers must be included.',
    example:
      '-----BEGIN PGP SIGNED MESSAGE-----\n' +
      'Hash: SHA512\n\n' +
      '<nonce>\n' +
      '-----BEGIN PGP SIGNATURE-----\n' +
      '...\n' +
      '-----END PGP SIGNATURE-----',
  })
  @IsString()
  @IsNotEmpty({ message: 'signature must not be empty.' })
  @MaxLength(65_536, { message: 'signature must not exceed 64 KiB.' })
  public signature!: string
}
