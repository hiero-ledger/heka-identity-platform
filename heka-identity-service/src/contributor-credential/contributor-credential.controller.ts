import { Controller, HttpCode, HttpStatus, Post, UseGuards, Version } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'

import { ContributorCredentialService } from './contributor-credential.service'
import { ContributorJwtGuard } from './contributor-jwt.guard'
import { ContributorCredentialOfferResponseDto } from './dto/contributor-credential-offer.dto'
import { ReqContributorAuth, type ContributorAuthInfo } from './req-contributor-auth.decorator'

/**
 * ContributorCredentialController
 *
 * Exposes the OID4VCI credential offer endpoint for the
 * `GithubContributorCredential` SD-JWT VC.
 *
 * All routes require a valid contributor JWT issued by auth-service
 * upon successful GPG challenge verification.
 */
@ApiTags('Contributor Credential')
@ApiBearerAuth()
@UseGuards(ContributorJwtGuard)
@Controller('contributor-credential')
export class ContributorCredentialController {
  public constructor(private readonly contributorCredentialService: ContributorCredentialService) {}

  /**
   * Create an OID4VCI credential offer for a verified contributor.
   *
   * Authenticated via ContributorJwtGuard with the token issued by auth-service.
   * The contributor's GitHub account ID is extracted from the verified JWT claims,
   * not from the request body, preventing identity spoofing.
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
    status: HttpStatus.UNAUTHORIZED,
    description: 'Missing or invalid contributor JWT token.',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'No verified contributor binding found for the authenticated GitHub account ID.',
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Contributor binding exists but GPG verification is not yet complete.',
  })
  public async createOffer(
    @ReqContributorAuth() contributor: ContributorAuthInfo,
  ): Promise<ContributorCredentialOfferResponseDto> {
    const credentialOffer = await this.contributorCredentialService.issueContributorCredential(
      contributor.githubAccountId,
    )
    return new ContributorCredentialOfferResponseDto(credentialOffer)
  }
}
