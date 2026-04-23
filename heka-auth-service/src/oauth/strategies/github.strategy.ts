import { ConfigService } from '@config'
import { Injectable, Logger, UnauthorizedException } from '@nestjs/common'
import { PassportStrategy } from '@nestjs/passport'
import { Profile, Strategy } from 'passport-github2'

export interface GitHubProfile {
  id: string
  username: string
  displayName: string
  emails: Array<{ value: string; primary?: boolean; verified?: boolean }>
  photos: Array<{ value: string }>
}

/**
 * Passport strategy for GitHub OAuth 2.0 authentication.
 *
 * Enables contributors to authenticate using their GitHub account —
 * the first step in the contributor identity verification onboarding flow.
 * After successful authentication, the contributor's GitHub identity
 * (id, username, email) can be linked to a DID and used to issue a
 * Verifiable Credential in Heka Identity Service.
 *
 * Follows the existing JwtStrategy pattern in src/oauth/strategies/.
 *
 * @see https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps
 */
@Injectable()
export class GitHubStrategy extends PassportStrategy(Strategy, 'github') {
  private readonly logger = new Logger(GitHubStrategy.name)

  public constructor(configService: ConfigService) {
    super({
      clientID: configService.githubConfig.clientId,
      clientSecret: configService.githubConfig.clientSecret,
      callbackURL: configService.githubConfig.callbackUrl,
      scope: ['user:email', 'read:user'],
    })
  }

  /**
   * Validates the GitHub OAuth profile after successful authentication.
   * Extracts the primary verified email, falling back to the first available.
   */
  public validate(
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
    done: (error: Error | null, user?: GitHubProfile | false) => void,
  ): void {
    this.logger.verbose({ githubId: profile.id, username: profile.username }, 'validate >')

    if (!profile.id || !profile.username) {
      this.logger.warn('GitHub profile missing required fields')
      done(new UnauthorizedException('Invalid GitHub profile'), false)
      return
    }

    const githubProfile: GitHubProfile = {
      id: profile.id,
      username: profile.username,
      displayName: profile.displayName || profile.username,
      emails: profile.emails || [],
      photos: profile.photos || [],
    }

    this.logger.verbose({ githubId: profile.id }, 'validate <')
    done(null, githubProfile)
  }
}
