import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common'

export interface VerifiedContributorDto {
  githubAccountId: string
  githubUsername: string
  gpgFingerprint: string
  verifiedAt: string
  walletId: string
}

/**
 * HTTP client for communicating with heka-auth-service.
 *
 * Auth-service is the single source of truth for contributor onboarding,
 * GitHub OAuth bindings, and GPG verification. Identity-service queries
 * auth-service via this client rather than maintaining duplicate tables.
 *
 * Protected via the shared INTERNAL_SERVICE_SECRET header.
 */
@Injectable()
export class AuthServiceClient {
  private readonly logger = new Logger(AuthServiceClient.name)
  private readonly baseUrl: string
  private readonly internalServiceSecret: string

  public constructor() {
    this.baseUrl = (process.env['AUTH_SERVICE_URL'] ?? 'http://localhost:3004').replace(/\/+$/, '')
    this.internalServiceSecret = process.env['INTERNAL_SERVICE_SECRET'] ?? ''
  }

  /**
   * Fetches the verified contributor binding from auth-service.
   *
   * @param githubAccountId Immutable GitHub account ID
   * @returns Verified contributor binding data
   * @throws {NotFoundException} if no binding exists
   * @throws {ConflictException} if binding exists but GPG verification is incomplete
   */
  public async getVerifiedContributor(githubAccountId: string): Promise<VerifiedContributorDto> {
    const url = `${this.baseUrl}/v2/contributor-onboarding/binding/${encodeURIComponent(githubAccountId)}`

    let response: Response
    try {
      response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-service-secret': this.internalServiceSecret,
        },
      })
    } catch (err) {
      this.logger.error(`Failed to reach auth-service at ${url}: ${(err as Error).message}`)
      throw new ServiceUnavailableException('Authentication service is currently unavailable.')
    }

    if (response.status === 404) {
      throw new NotFoundException(`No contributor binding found for GitHub account ID '${githubAccountId}'.`)
    }

    if (response.status === 409) {
      const body = (await response.json().catch(() => ({}))) as { message?: string }
      throw new ConflictException(body.message || `Contributor has not completed GPG verification.`)
    }

    if (response.status === 401 || response.status === 403) {
      this.logger.error('Auth-service rejected internal service secret.')
      throw new InternalServerErrorException('Internal service communication failed.')
    }

    if (!response.ok) {
      throw new InternalServerErrorException(`Auth-service returned HTTP ${response.status}`)
    }

    return (await response.json()) as VerifiedContributorDto
  }
}
