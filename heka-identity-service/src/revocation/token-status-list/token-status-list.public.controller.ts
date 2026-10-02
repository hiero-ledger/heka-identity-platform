import { Controller, Get, Header, Headers, NotAcceptableException, Param } from '@nestjs/common'
import { ApiNotAcceptableResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger'

import { InjectLogger, Logger } from 'common/logger'

import {
  TOKEN_STATUS_LIST_JWT_MEDIA_TYPE,
  TOKEN_STATUS_LIST_TTL_SECONDS,
  TokenStatusListService,
} from './token-status-list.service'

/** Whether an `Accept` header admits the JWT status list token. Absent = accept anything. */
export function acceptsStatusListJwt(accept: string | undefined): boolean {
  if (!accept || accept.trim() === '') return true
  return accept
    .split(',')
    .map((entry) => entry.split(';')[0].trim().toLowerCase())
    .some(
      (mediaType) =>
        mediaType === TOKEN_STATUS_LIST_JWT_MEDIA_TYPE || mediaType === 'application/*' || mediaType === '*/*',
    )
}

/**
 * Public download of IETF Token Status Lists (draft-ietf-oauth-status-list). Tenant-less and
 * **unauthenticated** — the token is signed, carries only status bits, and is fetched by any verifier
 * (Credo, the EUDI reference wallet) that receives an SD-JWT VC pointing at it.
 *
 * JWT format only; a CWT-only `Accept` is answered with 406.
 */
@ApiTags('Token Status List (public)')
@Controller('token-status-lists')
export class TokenStatusListPublicController {
  public constructor(
    private readonly tokenStatusListService: TokenStatusListService,
    @InjectLogger(TokenStatusListPublicController)
    private readonly logger: Logger,
  ) {
    this.logger.child('constructor').trace('<>')
  }

  @ApiOperation({ summary: 'Download a Status List Token (IETF token status list, `application/statuslist+jwt`)' })
  @ApiOkResponse({ description: 'The signed Status List Token (compact JWS, `typ: statuslist+jwt`)' })
  @ApiNotFoundResponse({ description: 'Unknown status list' })
  @ApiNotAcceptableResponse({ description: 'Only the JWT format is available' })
  @Get(':id')
  @Header('Content-Type', TOKEN_STATUS_LIST_JWT_MEDIA_TYPE)
  @Header('Cache-Control', `max-age=${TOKEN_STATUS_LIST_TTL_SECONDS}`)
  public async get(@Param('id') id: string, @Headers('accept') accept?: string): Promise<string> {
    const logger = this.logger.child('get', { id })
    logger.trace('>')

    if (!acceptsStatusListJwt(accept)) {
      throw new NotAcceptableException(`Only ${TOKEN_STATUS_LIST_JWT_MEDIA_TYPE} is available for this status list`)
    }
    const token = await this.tokenStatusListService.getToken(id)

    logger.trace('<')
    return token
  }
}
