import { Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common'
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'

import { AuthInfo, JwtAuthGuard, ReqAuthInfo } from 'common/auth'
import { AnyRole, RoleGuard } from 'common/authz'
import { ContributorThrottlerGuard } from 'contributor-onboarding'

import { ContributorCredentialService } from './contributor-credential.service'
import { ContributorCredentialOfferResponseDto } from './dto/contributor-credential-offer.dto'

/**
 * Issues an OID4VCI offer for the GithubContributorCredential.
 * The caller authenticates with their existing Heka session. GitHub is a linked
 * account, so this route does not accept a GitHub login token.
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
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Issue a GitHub Contributor Credential offer',
    description:
      'Optional feature: available when CONTRIBUTOR_VERIFICATION_ENABLED=true. Generates an OID4VCI SD-JWT VC credential offer for the authenticated user after ' +
      'they have linked GitHub and completed GPG verification. Returns an openid-credential-offer:// URI and the transaction code the wallet asks for.',
  })
  @ApiOkResponse({ description: 'Credential offer created.', type: ContributorCredentialOfferResponseDto })
  @ApiNotFoundResponse({
    description: 'No contributor binding for this user, or the contributor credential issuer is not set up.',
  })
  @ApiConflictResponse({ description: 'GitHub is linked, but GPG verification is not complete.' })
  public async createOffer(@ReqAuthInfo() authInfo: AuthInfo): Promise<ContributorCredentialOfferResponseDto> {
    const offer = await this.contributorCredentialService.issueContributorCredential(authInfo)
    return new ContributorCredentialOfferResponseDto(offer.credentialOffer, offer.txCode, offer.expiresAt)
  }
}
