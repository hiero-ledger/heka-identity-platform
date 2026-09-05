import { Body, Controller, HttpCode, HttpStatus, Post, Version } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'

import { ContributorCredentialService } from './contributor-credential.service'
import {
  ContributorCredentialOfferRequestDto,
  ContributorCredentialOfferResponseDto,
} from './dto/contributor-credential-offer.dto'

/**
 * ContributorCredentialController
 *
 * Exposes the OID4VCI credential offer endpoint for the
 * `GithubContributorCredential` SD-JWT VC.
 *
 * All routes require a valid Heka JWT (issued after GitHub OAuth login).
 */
@ApiTags('Contributor Credential')
@ApiBearerAuth()
@Controller('contributor-credential')
export class ContributorCredentialController {
  public constructor(private readonly contributorCredentialService: ContributorCredentialService) {}

  /**
   * Create an OID4VCI credential offer for a verified contributor.
   *
   * Looks up the verified `ContributorBinding` by `githubAccountId`,
   * builds an SD-JWT VC payload with the Week 2 disclosure policy, and
   * returns an `openid-credential-offer://` URI the contributor's wallet
   * can use to retrieve the credential.
   *
   * **Requirements:** The contributor must have:
   *   1. Completed GitHub OAuth login (`/contributor-onboarding/github/callback`)
   *   2. Requested a GPG challenge (`/gpg-challenge/request`)
   *   3. Submitted a valid GPG signature proof (`/gpg-challenge/verify`)
   */
  @Version('2')
  @Post('offer')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Issue a GitHub Contributor Credential offer',
    description:
      'Generates an OID4VCI SD-JWT VC credential offer for a contributor who has completed ' +
      'GitHub OAuth login and GPG key verification. Returns an openid-credential-offer:// URI.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Credential offer created successfully.',
    type: ContributorCredentialOfferResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'No verified contributor binding found for the given GitHub account ID.',
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Contributor binding exists but GPG verification is not yet complete.',
  })
  public async createOffer(
    @Body() req: ContributorCredentialOfferRequestDto,
  ): Promise<ContributorCredentialOfferResponseDto> {
    const credentialOffer = await this.contributorCredentialService.issueContributorCredential(req.githubAccountId)
    return new ContributorCredentialOfferResponseDto(credentialOffer)
  }
}
