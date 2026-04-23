import { Injectable } from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'

/**
 * Guard that initiates the GitHub OAuth 2.0 flow.
 * When applied to a route, redirects the user to GitHub for authentication.
 */
@Injectable()
export class GitHubGuard extends AuthGuard('github') {}
