import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common'
import {
  ApiBadGatewayResponse,
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'

import { AuthInfo, JwtAuthGuard, ReqAuthInfo } from 'common/auth'
import { AnyRole, RoleGuard } from 'common/authz'

import { ContributorOnboardingService } from './contributor-onboarding.service'
import { ContributorThrottlerGuard } from './contributor-throttler.guard'
import { ContributorOnboardingStatusDto } from './dto/contributor-onboarding-status.dto'
import { GithubLinkCallbackDto } from './dto/github-link-callback.dto'
import { GithubLinkCallbackResponseDto, GithubLinkStartResponseDto } from './dto/github-link-response.dto'

@ApiTags('Contributor Onboarding')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid Heka token.' })
@ApiTooManyRequestsResponse({ description: 'More than 10 requests per minute to this route by this user.' })
@UseGuards(JwtAuthGuard, RoleGuard, ContributorThrottlerGuard)
/** Any authenticated Heka role. The service still scopes every read and write to the caller. */
@AnyRole()
@Controller({ path: 'contributor-onboarding', version: ['2'] })
export class ContributorOnboardingController {
  public constructor(private readonly contributorOnboardingService: ContributorOnboardingService) {}

  @Get('status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get GitHub link and GPG verification status for the logged-in user.',
    description: 'Optional feature: available when CONTRIBUTOR_VERIFICATION_ENABLED=true.',
  })
  @ApiOkResponse({ type: ContributorOnboardingStatusDto })
  public async getStatus(@ReqAuthInfo() authInfo: AuthInfo): Promise<ContributorOnboardingStatusDto> {
    return this.contributorOnboardingService.getStatus(authInfo)
  }

  @Post('github/link/start')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Start linking a GitHub account to the logged-in Heka user.',
    description:
      'Optional feature: available when CONTRIBUTOR_VERIFICATION_ENABLED=true. Returns the GitHub authorization URL; this does not create a session.',
  })
  @ApiOkResponse({ type: GithubLinkStartResponseDto })
  public async startGithubLink(@ReqAuthInfo() authInfo: AuthInfo): Promise<GithubLinkStartResponseDto> {
    return this.contributorOnboardingService.createGithubLinkRequest(authInfo)
  }

  @Post('github/link/callback')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Finish linking the GitHub account for the logged-in Heka user.',
    description:
      'Optional feature: available when CONTRIBUTOR_VERIFICATION_ENABLED=true. The existing Heka session is unchanged.',
  })
  @ApiOkResponse({ type: GithubLinkCallbackResponseDto })
  @ApiBadRequestResponse({
    description: 'The state is invalid, expired, already used, or was started by another user.',
  })
  @ApiConflictResponse({
    description:
      'The GitHub account is linked to another Heka user, or a concurrent request linked a GitHub account to this user.',
  })
  @ApiBadGatewayResponse({ description: 'GitHub rejected the code or returned no usable identity.' })
  public async githubLinkCallback(
    @ReqAuthInfo() authInfo: AuthInfo,
    @Body() dto: GithubLinkCallbackDto,
  ): Promise<GithubLinkCallbackResponseDto> {
    return this.contributorOnboardingService.completeGithubLink(authInfo, dto.code, dto.state)
  }

  @Delete('github')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Unlink the GitHub account of the logged-in Heka user.',
    description:
      'Optional feature: available when CONTRIBUTOR_VERIFICATION_ENABLED=true. Deletes the binding with its GPG verification, pending link attempts and open GPG challenges. Credentials already issued stay valid until they expire, unless an operator of the issuer organization revokes them from its issued credentials.',
  })
  @ApiNoContentResponse({ description: 'Unlinked, or nothing was linked.' })
  public async unlinkGithub(@ReqAuthInfo() authInfo: AuthInfo): Promise<void> {
    await this.contributorOnboardingService.unlinkGithub(authInfo)
  }
}
