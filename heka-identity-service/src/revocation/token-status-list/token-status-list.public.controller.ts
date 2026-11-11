import type { Response } from 'express'

import { Controller, Get, Headers, NotAcceptableException, Param, Res } from '@nestjs/common'
import {
  ApiHeader,
  ApiNotAcceptableResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger'

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
  @ApiOkResponse({
    description: 'The signed Status List Token (compact JWS, `typ: statuslist+jwt`)',
    headers: {
      'Content-Type': { description: TOKEN_STATUS_LIST_JWT_MEDIA_TYPE, schema: { type: 'string' } },
      'Cache-Control': { description: `max-age=${TOKEN_STATUS_LIST_TTL_SECONDS}`, schema: { type: 'string' } },
      Vary: { description: 'Accept', schema: { type: 'string' } },
    },
  })
  @ApiNotFoundResponse({ description: 'Unknown status list' })
  @ApiNotAcceptableResponse({ description: 'Only the JWT format is available' })
  @ApiHeader({
    name: 'accept',
    required: false,
    description: `Absent, \`*/*\` or \`${TOKEN_STATUS_LIST_JWT_MEDIA_TYPE}\`; a CWT-only Accept gets 406`,
  })
  @Get(':id')
  public async get(
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
    @Headers('accept') accept?: string,
  ): Promise<string> {
    const logger = this.logger.child('get', { id })
    logger.trace('>')

    // Both the token and the 406 depend on `Accept`
    res.vary('Accept')
    if (!acceptsStatusListJwt(accept)) {
      throw new NotAcceptableException(`Only ${TOKEN_STATUS_LIST_JWT_MEDIA_TYPE} is available for this status list`)
    }
    const token = await this.tokenStatusListService.getToken(id)

    // Only the token gets its media type and cache lifetime: errors stay JSON and are not cached
    res.set('Content-Type', TOKEN_STATUS_LIST_JWT_MEDIA_TYPE)
    res.set('Cache-Control', `max-age=${TOKEN_STATUS_LIST_TTL_SECONDS}`)

    logger.trace('<')
    return token
  }
}
