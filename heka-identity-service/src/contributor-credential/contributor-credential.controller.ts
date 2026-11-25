import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common'
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'
import { Throttle } from '@nestjs/throttler'

import { AuthInfo, JwtAuthGuard, ReqAuthInfo } from 'common/auth'
import { AnyRole, RoleGuard } from 'common/authz'
import { ContributorThrottlerGuard } from 'contributor-onboarding'
import { CONTRIBUTOR_RATE_LIMIT_WINDOW_MS } from 'contributor-onboarding/contributor-throttler.guard'

import { ContributorCredentialService } from './contributor-credential.service'
import {
  ContributorCredentialOfferResponseDto,
  ContributorCredentialOfferStateDto,
} from './dto/contributor-credential-offer.dto'

/** Leaves room for the web UI, which polls an offer's state every 2 seconds while the wallet receives it. */
const OFFER_STATE_RATE_LIMIT = 60

/**
 * Offers the GitHub contributor credential and reports the offer's state.
 * The caller authenticates with their existing Heka session. GitHub is a linked
 * account, so these routes do not accept a GitHub login token.
 */
@ApiTags('Contributor Credential')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid Heka token.' })
@ApiTooManyRequestsResponse({ description: 'More than 10 requests per minute to this route by this user.' })
@UseGuards(JwtAuthGuard, RoleGuard, ContributorThrottlerGuard)
/** Any authenticated Heka role. Issuance still requires that caller's own verified binding. */
@AnyRole()
@Controller({ path: 'contributor-credential', version: ['2'] })
export class ContributorCredentialController {
  public constructor(private readonly contributorCredentialService: ContributorCredentialService) {}

  @Post('offer')
  @ApiOperation({
    summary: 'Issue a GitHub Contributor Credential offer',
    description:
      'Optional feature: available when CONTRIBUTOR_VERIFICATION_ENABLED=true. Generates an OID4VCI SD-JWT VC credential offer for the authenticated user after ' +
      'they have linked GitHub and completed GPG verification. The issuer organization (CONTRIBUTOR_ISSUER_ORG_ID) signs it with CONTRIBUTOR_ISSUER_DID, ' +
      "and the credential appears in that organization's issued credentials, where operators can revoke it. Returns an openid-credential-offer:// URI, " +
      'the transaction code the wallet asks for, the expiry of the offer and its issuance session id.',
  })
  @ApiCreatedResponse({ description: 'Credential offer created.', type: ContributorCredentialOfferResponseDto })
  @ApiNotFoundResponse({ description: 'No contributor binding for this user.' })
  @ApiConflictResponse({ description: 'GitHub is linked, but GPG verification is not complete.' })
  @ApiServiceUnavailableResponse({
    description: 'The contributor credential issuer is not set up; the message says what is missing.',
  })
  public async createOffer(@ReqAuthInfo() authInfo: AuthInfo): Promise<ContributorCredentialOfferResponseDto> {
    return this.contributorCredentialService.offer(authInfo)
  }

  @Get('offer/:issuanceSessionId')
  @Throttle({ contributor: { limit: OFFER_STATE_RATE_LIMIT, ttl: CONTRIBUTOR_RATE_LIMIT_WINDOW_MS } })
  @ApiOperation({
    summary: 'Get the state of a GitHub Contributor Credential offer',
    description:
      'Optional feature: available when CONTRIBUTOR_VERIFICATION_ENABLED=true. The state of an offer the caller requested: Completed once ' +
      'the wallet has received the credential, Error when issuance failed. After expiresAt the offer can no longer be redeemed.',
  })
  @ApiParam({ name: 'issuanceSessionId', type: String })
  @ApiOkResponse({ type: ContributorCredentialOfferStateDto })
  @ApiNotFoundResponse({
    description: 'The caller requested no offer with this id, or its issuance session was deleted.',
  })
  @ApiTooManyRequestsResponse({ description: 'More than 60 requests per minute to this route by this user.' })
  public async getOfferState(
    @ReqAuthInfo() authInfo: AuthInfo,
    @Param('issuanceSessionId') issuanceSessionId: string,
  ): Promise<ContributorCredentialOfferStateDto> {
    return this.contributorCredentialService.getOfferState(authInfo, issuanceSessionId)
  }
}
