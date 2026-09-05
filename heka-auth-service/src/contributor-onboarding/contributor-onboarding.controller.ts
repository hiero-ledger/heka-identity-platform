import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query, Req, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger'
import type { Request } from 'express'
import { JwtService } from '@nestjs/jwt'

import { BearerGuard, extractTokenFromRequest } from '../oauth/guards'
import { ConfigService } from '@config'

import { ContributorOnboardingService } from './contributor-onboarding.service'
import { ContributorOnboardingStatusDto, type AuthInfo } from './contributor-onboarding.types'
import { GithubOAuthCallbackDto, GithubOAuthUrlQueryDto } from './dto'

@ApiTags('Contributor Onboarding')
@Controller('contributor-onboarding')
export class ContributorOnboardingController {
  public constructor(
    private readonly contributorOnboardingService: ContributorOnboardingService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  @ApiOperation({ summary: 'Create a GitHub OAuth authorization URL for contributor login.' })
  @ApiOkResponse({ description: 'GitHub OAuth URL generated.' })
  @Get('github/authorization-url')
  @HttpCode(HttpStatus.OK)
  public getGithubAuthorizationUrl(@Query() query: GithubOAuthUrlQueryDto): {
    authorizationUrl: string
    state: string
  } {
    return this.contributorOnboardingService.createGithubAuthorizationUrl(query.redirectPath)
  }

  @ApiOperation({ summary: 'Complete GitHub OAuth contributor login.' })
  @ApiOkResponse({ description: 'Contributor logged in with GitHub.' })
  @Post('github/callback')
  @HttpCode(HttpStatus.OK)
  public async githubCallback(@Body() dto: GithubOAuthCallbackDto): Promise<{
    access: string
    refresh: null
    github: { accountId: string; username: string }
    binding: {
      githubAccountId: string
      githubUsername: string
      walletId: string
      gpgFingerprint?: string
      verifiedAt?: Date
      updatedAt: Date
    }
    redirectPath?: string
  }> {
    return this.contributorOnboardingService.loginWithGithubOAuth(dto.code, dto.state)
  }

  @ApiBearerAuth()
  @ApiUnauthorizedResponse({ description: 'Unauthorized.' })
  @ApiOperation({ summary: 'Get contributor onboarding status for the logged-in contributor.' })
  @ApiOkResponse({ description: 'Contributor onboarding status.' })
  @UseGuards(BearerGuard)
  @Get('status')
  @HttpCode(HttpStatus.OK)
  public async getStatus(@Req() request: Request): Promise<ContributorOnboardingStatusDto> {
    const token = extractTokenFromRequest(request as any)
    const authInfo = await this.jwtService.verifyAsync<AuthInfo>(token, {
      secret: this.configService.jwtConfig.secret,
      issuer: this.configService.jwtConfig.issuer,
      audience: this.configService.jwtConfig.audience,
    })
    return this.contributorOnboardingService.getStatus(authInfo)
  }
}
