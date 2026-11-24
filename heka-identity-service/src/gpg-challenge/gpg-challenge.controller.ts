import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common'
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'

import { AuthInfo, JwtAuthGuard, ReqAuthInfo } from 'common/auth'
import { AnyRole, RoleGuard } from 'common/authz'

import { ContributorThrottlerGuard } from '../contributor-onboarding'

import { GpgChallengeResponseDto, VerifySignatureDto, VerifySignatureResponseDto } from './dto'
import { GpgChallengeService, VerificationResult } from './gpg-challenge.service'

@ApiTags('GPG Challenge')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid Heka token.' })
@ApiTooManyRequestsResponse({ description: 'More than 10 requests per minute to this route by this user.' })
@UseGuards(JwtAuthGuard, RoleGuard, ContributorThrottlerGuard)
@AnyRole()
@Controller({ path: 'gpg-challenge', version: ['2'] })
export class GpgChallengeController {
  public constructor(private readonly gpgChallengeService: GpgChallengeService) {}

  @Post('request')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Request a GPG ownership challenge for the linked GitHub account',
    description:
      'Optional feature: available when CONTRIBUTOR_VERIFICATION_ENABLED=true. Returns a single-use nonce that expires after 5 minutes. Sign it with `echo -n "<nonce>" | gpg --clearsign --armor` and submit the armored output to POST /v2/gpg-challenge/verify.',
  })
  @ApiCreatedResponse({ type: GpgChallengeResponseDto })
  @ApiConflictResponse({ description: 'No GitHub account is linked yet.' })
  public async requestChallenge(@ReqAuthInfo() authInfo: AuthInfo): Promise<GpgChallengeResponseDto> {
    const challenge = await this.gpgChallengeService.createChallengeForUser(authInfo)
    return {
      challengeId: challenge.id,
      nonce: challenge.nonce,
      expiresAt: challenge.expiresAt,
      githubUsername: challenge.githubUsername,
      githubAccountId: challenge.githubAccountId,
    }
  }

  @Post('verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Submit a GPG signature for verification',
    description:
      'Optional feature: available when CONTRIBUTOR_VERIFICATION_ENABLED=true. Verifies a cleartext signature against the public key at https://github.com/<username>.gpg. The challenge is burned on first use. The signature must be made within the challenge window, by a key that is valid now.',
  })
  @ApiOkResponse({ type: VerifySignatureResponseDto, description: 'Verification finished. Read the `verified` field.' })
  @ApiBadRequestResponse({
    description:
      'Replay, expired nonce, missing key, malformed signature, a signature dated outside the challenge window, or an expired or revoked signing key.',
  })
  @ApiNotFoundResponse({ description: 'Challenge id not found for this user.' })
  @ApiTooManyRequestsResponse({
    description: 'More than 10 requests per minute to this route by this user, or the GitHub rate limit was reached.',
  })
  @ApiServiceUnavailableResponse({ description: 'GitHub is unreachable.' })
  public async verifySignature(
    @ReqAuthInfo() authInfo: AuthInfo,
    @Body() dto: VerifySignatureDto,
  ): Promise<VerifySignatureResponseDto> {
    const result: VerificationResult = await this.gpgChallengeService.verifySignature(
      authInfo,
      dto.challengeId,
      dto.signature,
    )

    if (result.verified) {
      return {
        verified: true,
        gpgFingerprint: result.gpgFingerprint,
        message: 'GPG signature successfully verified.',
      }
    }

    return {
      verified: false,
      message: result.message ?? 'Cryptographic verification failed. Ensure you signed the exact nonce string.',
    }
  }
}
