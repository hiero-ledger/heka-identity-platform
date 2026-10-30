import { Controller, HttpCode, HttpStatus, Post, UseGuards, Version } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'

import { AuthInfo, JwtAuthGuard, ReqAuthInfo } from 'common/auth'

import { ContributorCredentialService } from './contributor-credential.service'
import { ContributorCredentialOfferResponseDto } from './dto/contributor-credential-offer.dto'

/**
 * Issues an OID4VCI offer for the GithubContributorCredential.
 * The caller authenticates with their existing Heka session. GitHub is a linked
 * account, so this route does not accept a GitHub login token.
 */
@ApiTags('Contributor Credential')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('contributor-credential')
export class ContributorCredentialController {
  public constructor(private readonly contributorCredentialService: ContributorCredentialService) {}

  /**
   * Create an OID4VCI credential offer for the authenticated user.
   * The binding is loaded from identity-service by user, tenant, and wallet.
   */
  @Version('2')
  @Post('offer')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Issue a GitHub Contributor Credential offer',
    description:
      'Generates an OID4VCI SD-JWT VC credential offer for the authenticated user after ' +
      'they have linked GitHub and completed GPG verification. Returns an openid-credential-offer:// URI.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Credential offer created successfully.',
    type: ContributorCredentialOfferResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Missing or invalid Heka session, or GitHub is not linked and verified.',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'No verified contributor binding found for this user and wallet.',
  })
  public async createOffer(@ReqAuthInfo() authInfo: AuthInfo): Promise<ContributorCredentialOfferResponseDto> {
    const credentialOffer = await this.contributorCredentialService.issueContributorCredential(authInfo)
    return new ContributorCredentialOfferResponseDto(credentialOffer)
  }
}
