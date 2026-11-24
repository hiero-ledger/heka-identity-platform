import * as crypto from 'crypto'

import { EntityManager } from '@mikro-orm/core'
import { HttpService } from '@nestjs/axios'
import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common'
import { ConfigType } from '@nestjs/config'
import axios from 'axios'
import * as openpgp from 'openpgp'
import { firstValueFrom } from 'rxjs'

import { AuthInfo } from 'common/auth'
import { InjectLogger, Logger } from 'common/logger'
import GithubConfig from 'config/github'

import { ContributorOnboardingService } from '../contributor-onboarding'

import { GpgChallenge } from './gpg-challenge.entity'

const CHALLENGE_TTL_MINUTES = 5
const CHALLENGE_TTL_MS = CHALLENGE_TTL_MINUTES * 60 * 1000

/** Clock difference accepted between the signer and this service, on both ends of the challenge window. */
const SIGNATURE_CLOCK_SKEW_MS = 5 * 60 * 1000

/** GitHub logins are 1–39 characters and cannot start or end with a hyphen. */
const GITHUB_USERNAME_PATTERN = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/
const ARMORED_PUBLIC_KEY_BLOCK_PATTERN =
  /-----BEGIN PGP PUBLIC KEY BLOCK-----[\s\S]*?-----END PGP PUBLIC KEY BLOCK-----/g

export interface VerificationSuccess {
  verified: true
  gpgFingerprint: string
  githubAccountId: string
  githubUsername: string
  walletId: string
}

export interface VerificationFailure {
  verified: false
  message?: string
}

export type VerificationResult = VerificationSuccess | VerificationFailure

interface CreateChallengeInput {
  userId: string
  tenantId: string
  walletId: string
  githubAccountId: string
  githubUsername: string
}

/** A rejected proof (400) whose reason goes to the audit log. */
class ProofRejectedException extends BadRequestException {
  public constructor(
    public readonly reason: string,
    message: string,
  ) {
    super(message)
  }
}

@Injectable()
export class GpgChallengeService {
  public constructor(
    private readonly em: EntityManager,
    private readonly httpService: HttpService,
    private readonly contributorOnboardingService: ContributorOnboardingService,
    @Inject(GithubConfig.KEY) private readonly githubConfig: ConfigType<typeof GithubConfig>,
    @InjectLogger(GpgChallengeService) private readonly logger: Logger,
  ) {}

  /**
   * Nonce bound to the caller's linked GitHub account.
   * The caller signs it with `echo "<nonce>" | gpg --clearsign`.
   */
  public async createChallengeForUser(authInfo: AuthInfo): Promise<GpgChallenge> {
    const binding = await this.contributorOnboardingService.getRequiredBindingForUser(authInfo)
    const challenge = await this.createChallenge({
      userId: authInfo.userId,
      tenantId: authInfo.tenantId,
      walletId: authInfo.walletId,
      githubAccountId: binding.githubAccountId,
      githubUsername: binding.githubUsername,
    })

    await this.contributorOnboardingService.recordChallengeRequested({
      userId: authInfo.userId,
      tenantId: authInfo.tenantId,
      githubAccountId: binding.githubAccountId,
      githubUsername: binding.githubUsername,
      walletId: authInfo.walletId,
      challengeId: challenge.id,
    })

    return challenge
  }

  public async createChallenge(input: CreateChallengeInput): Promise<GpgChallenge> {
    // Expired challenges stay one more TTL, so a late submission still gets the "expired" answer rather than 404
    await this.em.nativeDelete(GpgChallenge, { expiresAt: { $lt: new Date(Date.now() - CHALLENGE_TTL_MS) } })

    const expiresAt = new Date()
    expiresAt.setMinutes(expiresAt.getMinutes() + CHALLENGE_TTL_MINUTES)

    const challenge = new GpgChallenge()
    challenge.userId = input.userId
    challenge.tenantId = input.tenantId
    challenge.walletId = input.walletId
    challenge.githubAccountId = input.githubAccountId
    challenge.githubUsername = input.githubUsername
    challenge.nonce = crypto.randomBytes(32).toString('hex')
    challenge.expiresAt = expiresAt
    challenge.consumed = false

    this.em.persist(challenge)
    await this.em.flush()
    this.logger.info(`Challenge created for @${input.githubUsername} (${challenge.id})`)
    return challenge
  }

  /**
   * Burns the nonce before any network or crypto work, then checks the
   * cleartext signature against the public key published at github.com/<user>.gpg.
   * The stored login is resolved first and must still be the linked numeric account.
   * A challenge that belongs to another user (OIDC subject) is reported as not found.
   */
  public async verifySignature(
    authInfo: AuthInfo,
    challengeId: string,
    armoredMessage: string,
  ): Promise<VerificationResult> {
    const challenge = await this.em.findOne(GpgChallenge, { id: challengeId })
    if (!challenge || challenge.userId !== authInfo.userId) {
      throw new NotFoundException(`Challenge session '${challengeId}' not found.`)
    }

    if (challenge.consumed) {
      throw new BadRequestException(
        'Replay attack detected: this challenge has already been consumed. Request a new challenge to try again.',
      )
    }

    if (new Date() > challenge.expiresAt) {
      throw new BadRequestException(
        `Challenge expired at ${challenge.expiresAt.toISOString()}. Request a new challenge - each nonce is valid for ${CHALLENGE_TTL_MINUTES} minutes.`,
      )
    }

    const updated = await this.em.nativeUpdate(GpgChallenge, { id: challengeId, consumed: false }, { consumed: true })
    if (updated === 0) {
      throw new BadRequestException(
        'Replay attack detected: this challenge has already been consumed. Request a new challenge to try again.',
      )
    }
    await this.em.refresh(challenge)
    this.logger.info(`Challenge ${challengeId} consumed for @${challenge.githubUsername}`)

    const currentAccountId = await this.resolveGithubAccountId(challenge.githubUsername)
    if (currentAccountId !== challenge.githubAccountId) {
      this.logger.warn(
        `GitHub login @${challenge.githubUsername} resolved to ${currentAccountId ?? 'nothing'}, not ${challenge.githubAccountId}`,
      )
      await this.recordRejectedProof(challenge, challengeId, 'GitHub login no longer matches the linked account')
      return {
        verified: false,
        message:
          'This GitHub login no longer belongs to the linked account. Link GitHub again, then request a new challenge.',
      }
    }

    const publicKeyArmored = await this.fetchGithubGpgKey(challenge.githubUsername)
    let verification: { isValid: false } | { isValid: true; gpgFingerprint: string }
    try {
      verification = await this.verifyPgpSignature(
        challenge.nonce,
        armoredMessage,
        publicKeyArmored,
        new Date(challenge.createdAt.getTime() - SIGNATURE_CLOCK_SKEW_MS),
      )
    } catch (error: unknown) {
      if (error instanceof BadRequestException) {
        const reason = error instanceof ProofRejectedException ? error.reason : 'Malformed signature'
        await this.recordRejectedProof(challenge, challengeId, reason)
      }
      throw error
    }

    if (!verification.isValid) {
      this.logger.warn(`Signature verification failed for @${challenge.githubUsername}`)
      await this.recordRejectedProof(challenge, challengeId, 'Invalid signature')
      return { verified: false }
    }

    const verifiedAt = new Date()
    const binding = await this.contributorOnboardingService.recordProofAccepted({
      userId: authInfo.userId,
      tenantId: authInfo.tenantId,
      githubAccountId: challenge.githubAccountId,
      githubUsername: challenge.githubUsername,
      walletId: authInfo.walletId,
      gpgFingerprint: verification.gpgFingerprint,
      verifiedAt,
    })
    if (!binding) {
      this.logger.warn(
        `Signature matched for challenge ${challengeId}, but the user's binding no longer points at that GitHub account`,
      )
      return {
        verified: false,
        message:
          'The signature was valid, but the linked GitHub account changed before it was saved. Request a new challenge and sign it again.',
      }
    }

    challenge.verifiedAt = verifiedAt
    challenge.gpgFingerprint = verification.gpgFingerprint
    await this.em.flush()

    return {
      verified: true,
      gpgFingerprint: verification.gpgFingerprint,
      githubAccountId: challenge.githubAccountId,
      githubUsername: challenge.githubUsername,
      walletId: authInfo.walletId,
    }
  }

  private githubUserUrl(githubUsername: string): string {
    const apiRoot = this.githubConfig.userApiUrl.replace(/\/user\/?$/, '')
    return `${apiRoot}/users/${encodeURIComponent(githubUsername)}`
  }

  /**
   * Always asks GitHub. A cached username-to-account mapping would let a renamed
   * or reused login pass proof verification during the cache window.
   */
  private async resolveGithubAccountId(githubUsername: string): Promise<string | null> {
    if (!GITHUB_USERNAME_PATTERN.test(githubUsername)) {
      return null
    }

    let account: { id?: number | string }
    try {
      const response = await firstValueFrom(
        this.httpService.get<{ id?: number | string }>(this.githubUserUrl(githubUsername), {
          timeout: this.githubConfig.requestTimeoutMs,
          headers: {
            Accept: 'application/vnd.github+json',
            'User-Agent': 'heka-identity-service',
          },
        }),
      )
      account = response.data
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status
        if (status === 404) return null
        if (status === 403 || status === 429) {
          throw new HttpException(
            'GitHub API rate limit reached. Please wait a few minutes before retrying.',
            HttpStatus.TOO_MANY_REQUESTS,
          )
        }
        throw new ServiceUnavailableException('Unable to reach GitHub to resolve this account. Retry shortly.')
      }
      throw error
    }

    if (account?.id === undefined || account.id === null || String(account.id).length === 0) return null
    return String(account.id)
  }

  private async recordRejectedProof(challenge: GpgChallenge, challengeId: string, reason: string): Promise<void> {
    await this.contributorOnboardingService.recordProofRejected({
      userId: challenge.userId,
      tenantId: challenge.tenantId,
      githubAccountId: challenge.githubAccountId,
      githubUsername: challenge.githubUsername,
      walletId: challenge.walletId,
      challengeId,
      reason,
    })
  }

  private async fetchGithubGpgKey(githubUsername: string): Promise<string> {
    if (!GITHUB_USERNAME_PATTERN.test(githubUsername)) {
      throw new BadRequestException(
        `Invalid GitHub username format: '${githubUsername}'. Usernames may only contain alphanumeric characters and hyphens.`,
      )
    }

    const base = this.githubConfig.gpgKeyBaseUrl.replace(/\/$/, '')
    const url = `${base}/${encodeURIComponent(githubUsername)}.gpg`

    let armoredKeys: string
    try {
      const response = await firstValueFrom(
        this.httpService.get<string>(url, { timeout: this.githubConfig.requestTimeoutMs }),
      )
      armoredKeys = response.data
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status
        if (status === 404) {
          throw new BadRequestException(
            `No public GPG key found for @${githubUsername} on GitHub. Upload your GPG public key at https://github.com/settings/keys before requesting a challenge.`,
          )
        }
        if (status === 403 || status === 429) {
          throw new HttpException(
            'GitHub API rate limit reached. Please wait a few minutes before retrying.',
            HttpStatus.TOO_MANY_REQUESTS,
          )
        }
        throw new ServiceUnavailableException(
          'Unable to reach GitHub to fetch your GPG public key. Check your network connection and retry.',
        )
      }
      throw error
    }

    if (!armoredKeys || armoredKeys.trim().length === 0) {
      throw new BadRequestException(
        `GitHub returned an empty GPG key for @${githubUsername}. Ensure your GPG key is uploaded and visible on your GitHub profile.`,
      )
    }

    return armoredKeys
  }

  /**
   * openpgp checks the key at the signature's creation time, which the signer chooses. So the creation
   * time must also fall inside the challenge window (`notBefore` to now, with clock skew), and the
   * signing key must still be valid now: an expired or revoked key can't prove ownership by backdating.
   */
  private async verifyPgpSignature(
    expectedNonce: string,
    armoredMessage: string,
    armoredKeys: string,
    notBefore: Date,
  ): Promise<{ isValid: false } | { isValid: true; gpgFingerprint: string }> {
    const publicKeys = await this.readPublicKeys(armoredKeys)

    let signedMessage: openpgp.CleartextMessage
    try {
      signedMessage = await openpgp.readCleartextMessage({ cleartextMessage: armoredMessage })
    } catch {
      throw new BadRequestException(
        'The submitted signature could not be parsed as a PGP cleartext-signed message. Ensure you ran: echo "<nonce>" | gpg --clearsign and submitted the complete output including the BEGIN/END headers.',
      )
    }

    const now = new Date()
    const notAfter = new Date(now.getTime() + SIGNATURE_CLOCK_SKEW_MS)
    // `date` only moves openpgp's "created in the future" check by the clock skew
    const verificationResult = await openpgp.verify({
      message: signedMessage,
      verificationKeys: publicKeys,
      date: notAfter,
    })

    const signature = verificationResult.signatures[0]
    if (!signature) {
      return { isValid: false }
    }

    let signingKeyId: openpgp.KeyID
    let signedAt: Date | null
    try {
      await signature.verified
      signingKeyId = signature.keyID
      signedAt = (await signature.signature).packets[0]?.created ?? null
    } catch {
      return { isValid: false }
    }

    if (signedMessage.getText().trim() !== expectedNonce) {
      this.logger.warn('Signed content did not match the challenge nonce')
      return { isValid: false }
    }

    if (!signedAt || signedAt < notBefore || signedAt > notAfter) {
      throw new ProofRejectedException(
        'Signature time outside the challenge window',
        `The signature is dated ${signedAt?.toISOString() ?? '(no date)'}, outside this challenge's window (${notBefore.toISOString()} to ${notAfter.toISOString()}). Request a new challenge and sign it now.`,
      )
    }

    await this.assertSigningKeyValidAt(publicKeys, signingKeyId, now)

    return {
      isValid: true,
      gpgFingerprint: this.extractFingerprint(publicKeys, signingKeyId),
    }
  }

  private async assertSigningKeyValidAt(
    publicKeys: openpgp.Key[],
    signingKeyId: openpgp.KeyID,
    date: Date,
  ): Promise<void> {
    const publicKey = publicKeys.find((key) => key.getKeys(signingKeyId).length > 0)
    try {
      await publicKey!.getSigningKey(signingKeyId, date)
    } catch {
      throw new ProofRejectedException(
        'Signing key expired or revoked',
        'The GPG key that made this signature is expired or revoked. Publish a valid key on GitHub, then request a new challenge and sign it with that key.',
      )
    }
  }

  private extractFingerprint(publicKeys: openpgp.Key[], signingKeyId: openpgp.KeyID): string {
    for (const publicKey of publicKeys) {
      const [matchingKey] = publicKey.getKeys(signingKeyId)
      if (matchingKey) {
        return matchingKey.getFingerprint().toUpperCase()
      }
    }
    throw new BadRequestException('The verified signature did not match any public GPG key from GitHub.')
  }

  private async readPublicKeys(armoredKeys: string): Promise<openpgp.Key[]> {
    try {
      const publicKeys = await openpgp.readKeys({ armoredKeys })
      const armoredBlocks = armoredKeys.match(ARMORED_PUBLIC_KEY_BLOCK_PATTERN) ?? []
      if (armoredBlocks.length <= publicKeys.length) {
        return publicKeys
      }

      const parsedBlocks = await Promise.all(
        armoredBlocks.map((armoredBlock) => openpgp.readKeys({ armoredKeys: armoredBlock })),
      )
      return parsedBlocks.flat()
    } catch {
      throw new BadRequestException(
        'The GPG public key returned by GitHub could not be parsed. This may indicate a corrupted key on your GitHub profile.',
      )
    }
  }
}
