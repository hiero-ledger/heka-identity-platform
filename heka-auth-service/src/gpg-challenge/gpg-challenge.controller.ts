import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Req, UseGuards } from '@nestjs/common'
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
import type { Request } from 'express'
import { JwtService } from '@nestjs/jwt'

import { BearerGuard, extractTokenFromRequest } from '../oauth/guards'
import { ConfigService } from '@config'
import type { AuthInfo } from '../contributor-onboarding/contributor-onboarding.types'

import { VerifySignatureDto } from './dto'
import { GpgChallengeService, ContributorStatus, VerificationResult } from './gpg-challenge.service'

/**
 * HTTP interface for the GPG challenge-response ownership-proof flow.
 *
 * Endpoints:
 *
 *   POST /gpg-challenge/request
 *     Generate a fresh nonce bound to the authenticated contributor's GitHub account.
 *
 *   POST /gpg-challenge/verify
 *     Submit a GPG-signed nonce and receive a verification result.
 *
 *   GET  /gpg-challenge/status/:githubUsername
 *     Query whether a contributor has already passed verification.
 *     Consumed by the Heka GitHub App to determine check-run outcomes.
 *
 * Challenge creation is authenticated because the nonce must be bound to the
 * GitHub account ID captured during OAuth. Signature verification remains keyed
 * by the opaque challenge ID and burns the nonce on first use.
 */
@ApiTags('GPG Challenge')
@Controller('gpg-challenge')
export class GpgChallengeController {
  public constructor(
    private readonly gpgChallengeService: GpgChallengeService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Request a new GPG ownership challenge for the authenticated GitHub account.
   *
   * Returns a random nonce that the contributor must sign with the GPG private
   * key registered on their GitHub profile.  The nonce expires after 5 minutes
   * and can only be used once.
   */
  @ApiOperation({
    summary: 'Request a new GPG ownership challenge',
    description:
      "Generates a cryptographically secure nonce bound to the authenticated contributor's GitHub account. " +
      'The contributor must sign the nonce using the GPG private key registered on their ' +
      'GitHub profile, then submit the armored output to POST /gpg-challenge/verify. ' +
      'The nonce expires after 5 minutes and is single-use.',
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Challenge created successfully.',
    schema: {
      example: {
        challengeId: 'd290f1ee-6c54-4b01-90e6-d701748f0851',
        nonce: 'a3f5b2c1...',
        expiresAt: '2026-07-06T10:00:00.000Z',
        githubUsername: 'darshit2308',
        githubAccountId: '12345678',
      },
    },
  })
  @ApiUnauthorizedResponse({ description: 'GitHub OAuth login is required before requesting a challenge.' })
  @ApiTooManyRequestsResponse({ description: 'GitHub API rate limit reached.' })
  @ApiServiceUnavailableResponse({ description: 'GitHub API is unreachable.' })
  @ApiBearerAuth()
  @UseGuards(BearerGuard)
  @Post('request')
  @HttpCode(HttpStatus.CREATED)
  public async requestChallenge(@Req() request: Request): Promise<{
    challengeId: string
    nonce: string
    expiresAt: Date
    githubUsername: string
    githubAccountId: string
  }> {
    const token = extractTokenFromRequest(request as any)
    const authInfo = await this.jwtService.verifyAsync<AuthInfo>(token, {
      secret: this.configService.jwtConfig.secret,
      issuer: this.configService.jwtConfig.issuer,
      audience: this.configService.jwtConfig.audience,
    })
    const challenge = await this.gpgChallengeService.createChallengeForWallet(authInfo.walletId)

    return {
      challengeId: challenge.id,
      nonce: challenge.nonce,
      expiresAt: challenge.expiresAt,
      githubUsername: challenge.githubUsername,
      githubAccountId: challenge.githubAccountId!,
    }
  }

  /**
   * Submit a GPG signature to verify ownership of a GitHub account.
   *
   * The contributor should sign the nonce returned by the request endpoint by
   * running `echo "<nonce>" | gpg --clearsign` and pasting the full armored
   * output into the `signature` field.
   */
  @ApiOperation({
    summary: 'Submit a GPG signature for verification',
    description:
      'Accepts a PGP cleartext-signed message produced by running:\n' +
      '  echo "<nonce>" | gpg --clearsign\n' +
      "The service fetches the contributor's public GPG key from GitHub and " +
      'verifies the signature cryptographically. The challenge is single-use; ' +
      'a second submission with the same challengeId returns 400 regardless of result.',
  })
  @ApiOkResponse({
    description: 'Verification completed (see `verified` field for the outcome).',
    schema: {
      examples: {
        success: {
          value: { verified: true, gpgFingerprint: 'A1B2C3D4E5F6...' },
        },
        failure: {
          value: { verified: false, message: 'Signature verification failed.' },
        },
      },
    },
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Replay attempt, expired challenge, no GPG key on GitHub, or malformed signature.',
  })
  @ApiNotFoundResponse({ description: 'Challenge ID not found.' })
  @ApiTooManyRequestsResponse({ description: 'GitHub API rate limit reached.' })
  @ApiServiceUnavailableResponse({ description: 'GitHub API is unreachable.' })
  @ApiUnauthorizedResponse({ description: 'GitHub OAuth login is required to verify a challenge.' })
  @ApiBearerAuth()
  @UseGuards(BearerGuard)
  @Post('verify')
  @HttpCode(HttpStatus.OK)
  public async verifySignature(
    @Req() request: Request,
    @Body() dto: VerifySignatureDto,
  ): Promise<{ verified: true; gpgFingerprint: string; message: string } | { verified: false; message: string }> {
    const token = extractTokenFromRequest(request as any)
    const authInfo = await this.jwtService.verifyAsync<AuthInfo>(token, {
      secret: this.configService.jwtConfig.secret,
      issuer: this.configService.jwtConfig.issuer,
      audience: this.configService.jwtConfig.audience,
    })

    const result: VerificationResult = await this.gpgChallengeService.verifySignature(
      dto.challengeId,
      dto.signature,
      authInfo.walletId,
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
      message: 'Cryptographic verification failed. Ensure you signed the exact nonce string.',
    }
  }

  /**
   * Query the GPG verification status for a GitHub contributor.
   *
   * Returns the most recent successful verification record for the given username,
   * or `{ isVerified: false }` if no verified challenge exists.
   *
   * This endpoint is consumed by the Heka GitHub App to determine the check-run
   * outcome when a contributor opens or updates a pull request.  It deliberately
   * returns HTTP 200 in all cases (including unverified contributors) so the App
   * never needs to handle 404 as a business-logic branch.
   */
  @ApiOperation({
    summary: 'Get the GPG verification status for a GitHub contributor',
    description:
      'Returns whether the contributor has completed GPG ownership verification. ' +
      'Used by the Heka GitHub App to post an appropriate check-run result. ' +
      'Always returns HTTP 200; check the `isVerified` field for the outcome.',
  })
  @ApiParam({
    name: 'githubUsername',
    description: 'GitHub login of the contributor.',
    example: 'darshit2308',
  })
  @ApiOkResponse({
    description: 'Status retrieved successfully.',
    schema: {
      examples: {
        verified: {
          value: {
            isVerified: true,
            githubUsername: 'darshit2308',
            gpgFingerprint: 'A1B2C3D4E5F6...',
            verifiedAt: '2026-07-06T09:30:00.000Z',
          },
        },
        unverified: {
          value: { isVerified: false, githubUsername: 'darshit2308' },
        },
      },
    },
  })
  @Get('status/:githubUsername')
  @HttpCode(HttpStatus.OK)
  public async getStatus(@Param('githubUsername') githubUsername: string): Promise<ContributorStatus> {
    return this.gpgChallengeService.getContributorStatus(githubUsername)
  }
}
