import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards, Version } from '@nestjs/common'
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger'

import { AuthInfo, JwtAuthGuard, ReqAuthInfo } from 'common/auth'

import { ContributorOnboardingService } from './contributor-onboarding.service'
import { ContributorOnboardingStatus } from './contributor-onboarding.types'
import { GithubLinkCallbackDto } from './dto/github-link-callback.dto'

@ApiTags('Contributor Onboarding')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Unauthorized.' })
@UseGuards(JwtAuthGuard)
@Controller('contributor-onboarding')
export class ContributorOnboardingController {
  public constructor(private readonly contributorOnboardingService: ContributorOnboardingService) {}

  @Version('2')
  @Get('status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get GitHub link and GPG verification status for the logged-in user.' })
  @ApiOkResponse({ description: 'Contributor onboarding status.' })
  public async getStatus(@ReqAuthInfo() authInfo: AuthInfo): Promise<ContributorOnboardingStatus> {
    return this.contributorOnboardingService.getStatus(authInfo)
  }

  @Version('2')
  @Post('github/link/start')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Start linking a GitHub account to the logged-in Heka user.' })
  @ApiOkResponse({ description: 'GitHub authorization URL. This does not create a session.' })
  public async startGithubLink(@ReqAuthInfo() authInfo: AuthInfo): Promise<{ authorizationUrl: string }> {
    return this.contributorOnboardingService.createGithubLinkRequest(authInfo)
  }

  @Version('2')
  @Post('github/link/callback')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Finish linking the GitHub account for the logged-in Heka user.' })
  @ApiOkResponse({ description: 'GitHub account linked. The existing Heka session is unchanged.' })
  public async githubLinkCallback(
    @ReqAuthInfo() authInfo: AuthInfo,
    @Body() dto: GithubLinkCallbackDto,
  ): Promise<{ linked: true; githubUsername: string }> {
    return this.contributorOnboardingService.completeGithubLink(authInfo, dto.code, dto.state)
  }
}
