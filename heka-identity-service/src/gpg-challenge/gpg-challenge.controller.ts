import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, UseGuards, Version } from '@nestjs/common'
import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'

import { AuthInfo, JwtAuthGuard, ReqAuthInfo } from 'common/auth'

import { GetStatusParamsDto, VerifySignatureDto } from './dto'
import { GithubAppStatusGuard } from './github-app-status.guard'
import { ContributorStatus, GpgChallengeService, VerificationResult } from './gpg-challenge.service'

@ApiTags('GPG Challenge')
@Controller('gpg-challenge')
export class GpgChallengeController {
  public constructor(private readonly gpgChallengeService: GpgChallengeService) {}

  @Version('2')
  @Post('request')
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth()
  @ApiUnauthorizedResponse({ description: 'Unauthorized.' })
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Request a GPG ownership challenge for the linked GitHub account',
    description:
      'Returns a single-use nonce that expires after 5 minutes. Sign it with `echo "<nonce>" | gpg --clearsign` and submit the armored output to POST /v2/gpg-challenge/verify.',
  })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'Challenge created.' })
  public async requestChallenge(@ReqAuthInfo() authInfo: AuthInfo): Promise<{
    challengeId: string
    nonce: string
    expiresAt: Date
    githubUsername: string
    githubAccountId: string
  }> {
    const challenge = await this.gpgChallengeService.createChallengeForUser(authInfo)
    return {
      challengeId: challenge.id,
      nonce: challenge.nonce,
      expiresAt: challenge.expiresAt,
      githubUsername: challenge.githubUsername,
      githubAccountId: challenge.githubAccountId,
    }
  }

  @Version('2')
  @Post('verify')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiUnauthorizedResponse({ description: 'Unauthorized.' })
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Submit a GPG signature for verification',
    description:
      'Verifies a cleartext signature against the public key at https://github.com/<username>.gpg. The challenge is burned on first use.',
  })
  @ApiOkResponse({ description: 'Verification finished. Read the `verified` field.' })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Replay, expired nonce, missing key, or malformed signature.',
  })
  @ApiNotFoundResponse({ description: 'Challenge id not found for this user.' })
  @ApiTooManyRequestsResponse({ description: 'GitHub rate limit reached.' })
  @ApiServiceUnavailableResponse({ description: 'GitHub is unreachable.' })
  public async verifySignature(
    @ReqAuthInfo() authInfo: AuthInfo,
    @Body() dto: VerifySignatureDto,
  ): Promise<{ verified: true; gpgFingerprint: string; message: string } | { verified: false; message: string }> {
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

  @Version('2')
  @Get('status/:githubUsername')
  @HttpCode(HttpStatus.OK)
  @UseGuards(GithubAppStatusGuard)
  @ApiBearerAuth()
  @ApiUnauthorizedResponse({ description: 'Missing or invalid GitHub App status token.' })
  @ApiTooManyRequestsResponse({ description: 'Too many status requests from this address.' })
  @ApiServiceUnavailableResponse({ description: 'Status checks are not configured, or GitHub is unreachable.' })
  @ApiOperation({
    summary: 'Get GPG verification status for a GitHub login',
    description:
      'Used by the Heka GitHub App. Requires the shared status token. Resolves the login to the current numeric GitHub account id, caches that lookup, and reads that binding. Always returns HTTP 200 for an unknown login; read `isVerified`.',
  })
  @ApiParam({ name: 'githubUsername', example: 'octocat' })
  @ApiOkResponse({ description: 'Status retrieved.' })
  public async getStatus(@Param() params: GetStatusParamsDto): Promise<ContributorStatus> {
    return this.gpgChallengeService.getContributorStatus(params.githubUsername)
  }
}
