import * as crypto from 'crypto'

import { InjectRepository } from '@mikro-orm/nestjs'
import { EntityRepository } from '@mikro-orm/postgresql'
import { HttpService } from '@nestjs/axios'
import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common'
import axios from 'axios'
import * as openpgp from 'openpgp'
import { firstValueFrom } from 'rxjs'

import { ContributorOnboardingService } from '../contributor-onboarding'

import { ConfigService } from '@config'

import { GpgChallenge } from './gpg-challenge.entity'

/** Nonce TTL in minutes. */
const CHALLENGE_TTL_MINUTES = 5

/**
 * Timeout in milliseconds for outbound GitHub API calls.
 * Keeps us well within GitHub's 10-second webhook delivery window and avoids
 * hanging the verification endpoint indefinitely on flaky networks.
 */
const GITHUB_REQUEST_TIMEOUT_MS = 8_000

/**
 * GitHub username validation pattern.
 *
 * GitHub usernames are 1–39 characters: alphanumeric or single hyphens,
 * cannot start or end with a hyphen.
 * Used to validate contributor-supplied values before they are interpolated
 * into outbound URLs to prevent SSRF via path traversal.
 *
 * @see https://docs.github.com/en/github/setting-up-and-managing-your-github-profile/personalizing-your-profile/about-your-profile
 */
const GITHUB_USERNAME_PATTERN = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/
const ARMORED_PUBLIC_KEY_BLOCK_PATTERN =
  /-----BEGIN PGP PUBLIC KEY BLOCK-----[\s\S]*?-----END PGP PUBLIC KEY BLOCK-----/g

/**
 * Describes a successfully verified challenge, returned to the controller
 * so it can compose a consistent HTTP response.
 */
export interface VerificationSuccess {
  verified: true
  gpgFingerprint: string
}

export interface VerificationFailure {
  verified: false
}

export type VerificationResult = VerificationSuccess | VerificationFailure

/**
 * Describes the active verification status of a GitHub contributor.
 * Used by the GitHub App to decide the check-run outcome for incoming PRs.
 */
export interface ContributorStatus {
  /** Whether the contributor has at least one successfully verified challenge. */
  isVerified: boolean
  /** GitHub username that was looked up. */
  githubUsername: string
  /** Fingerprint of the GPG key used for verification, if verified. */
  gpgFingerprint?: string
  /** UTC timestamp of the most recent successful verification, if verified. */
  verifiedAt?: Date
}

/**
 * GpgChallengeService
 *
 * Implements the cryptographic ownership-proof flow:
 *
 * 1. {@link createChallenge} - Generates a cryptographically secure 32-byte
 *    nonce, persists it with a 5-minute TTL, and returns it to the caller.
 *    The caller instructs the contributor to run:
 *      echo "<nonce>" | gpg --clearsign
 *    and paste the resulting armored block into the verification endpoint.
 *
 * 2. {@link verifySignature} - Burns the challenge immediately (before any
 *    network I/O) to prevent replay attacks, fetches the contributor's public
 *    GPG key from GitHub, then verifies the armored signature cryptographically
 *    with openpgp.  On success, stamps `verifiedAt` and records the key
 *    fingerprint.
 *
 * 3. {@link getContributorStatus} - Lightweight read-only query used by the
 *    Heka GitHub App to determine if a PR author is already verified.
 *
 * Error handling follows the principle of least surprise: every external
 * failure mode maps to a distinct HTTP status code so callers can react
 * programmatically rather than parsing error message strings.
 */
@Injectable()
export class GpgChallengeService {
  private readonly logger = new Logger(GpgChallengeService.name)

  public constructor(
    @InjectRepository(GpgChallenge)
    private readonly challengeRepo: EntityRepository<GpgChallenge>,
    private readonly httpService: HttpService,
    private readonly contributorOnboardingService: ContributorOnboardingService,
    private readonly configService: ConfigService,
  ) {}

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Creates a new GPG challenge for the given GitHub username.
   *
   * The nonce is 64 hex characters (32 bytes from `crypto.randomBytes`),
   * which provides 256 bits of entropy, sufficient to prevent brute-force
   * guessing within the 5-minute window.
   *
   * @param githubUsername - GitHub login of the contributor requesting the challenge.
   * @returns The persisted {@link GpgChallenge} entity.
   */
  public async createChallenge(input: {
    githubUsername: string
    githubAccountId?: string
    walletId?: string
  }): Promise<GpgChallenge> {
    const nonce = crypto.randomBytes(32).toString('hex')

    const expiresAt = new Date()
    expiresAt.setMinutes(expiresAt.getMinutes() + CHALLENGE_TTL_MINUTES)

    const challenge = this.challengeRepo.create({
      githubUsername: input.githubUsername,
      githubAccountId: input.githubAccountId,
      walletId: input.walletId,
      nonce,
      expiresAt,
      consumed: false,
      createdAt: new Date(),
    })

    const em = this.challengeRepo.getEntityManager()
    em.persist(challenge)
    await em.flush()
    this.logger.log(`Challenge created for @${input.githubUsername} - id: ${challenge.id}`)

    return challenge
  }

  public async createChallengeForWallet(walletId: string): Promise<GpgChallenge> {
    const binding = await this.contributorOnboardingService.getRequiredBindingForWallet(walletId)

    return this.createChallenge({
      githubUsername: binding.githubUsername,
      githubAccountId: binding.githubAccountId,
      walletId: binding.walletId,
    })
  }

  /**
   * Verifies a GPG challenge response.
   *
   * **Burn-before-verify:** The challenge is marked `consumed = true` and
   * flushed to the database *before* any network I/O or cryptographic work
   * begins.  This guarantees that even if the process crashes mid-verification,
   * the nonce cannot be reused, preventing replay attacks under all failure
   * modes.
   *
   * @param challengeId - UUID of the active challenge to verify against.
   * @param armoredMessage - PGP cleartext-signed message produced by `gpg --clearsign`.
   * @returns A {@link VerificationResult} union indicating success or failure.
   *
   * @throws {NotFoundException} The challenge ID does not exist.
   * @throws {BadRequestException} Replay attempt, expired challenge, no GPG key
   *   on GitHub profile, or malformed signature.
   * @throws {HttpException} (429) GitHub API rate limit reached.
   * @throws {ServiceUnavailableException} GitHub API unreachable.
   */
  public async verifySignature(
    challengeId: string,
    armoredMessage: string,
    authenticatedWalletId?: string,
  ): Promise<VerificationResult> {
    const challenge = await this.challengeRepo.findOne({ id: challengeId })

    if (!challenge) {
      throw new NotFoundException(`Challenge session '${challengeId}' not found.`)
    }

    // Ownership check: if the caller is authenticated, the challenge must belong
    // to their wallet. This prevents a logged-in user from consuming another
    // contributor's challenge and stamping verifiedAt on an unrelated record.
    if (authenticatedWalletId && challenge.walletId && authenticatedWalletId !== challenge.walletId) {
      throw new NotFoundException(`Challenge session '${challengeId}' not found.`)
    }

    if (challenge.consumed) {
      throw new BadRequestException(
        'Replay attack detected: this challenge has already been consumed. ' + 'Request a new challenge to try again.',
      )
    }

    if (new Date() > challenge.expiresAt) {
      throw new BadRequestException(
        `Challenge expired at ${challenge.expiresAt.toISOString()}. ` +
          `Request a new challenge - each nonce is valid for ${CHALLENGE_TTL_MINUTES} minutes.`,
      )
    }

    // --- Burn-before-verify (atomic) ---
    // Use a single UPDATE ... WHERE consumed = false to atomically claim the
    // challenge. This prevents two concurrent verify requests from both passing
    // the consumed = false guard and proceeding to signature verification.
    const em = this.challengeRepo.getEntityManager()
    const updated = await em.nativeUpdate(
      GpgChallenge,
      { id: challengeId, consumed: false },
      { consumed: true },
    )
    if (updated === 0) {
      // Another concurrent request consumed it between our findOne and here.
      throw new BadRequestException(
        'Replay attack detected: this challenge has already been consumed. Request a new challenge to try again.',
      )
    }
    // Refresh local entity to reflect the DB state.
    await em.refresh(challenge)
    this.logger.log(`Challenge ${challengeId} consumed for @${challenge.githubUsername}`)

    // --- Fetch public key from GitHub ---
    const publicKeyArmored = await this.fetchGithubGpgKey(challenge.githubUsername)

    // --- Cryptographic verification ---
    const verification = await this.verifyPgpSignature(challenge.nonce, armoredMessage, publicKeyArmored)

    if (!verification.isValid) {
      this.logger.warn(`Signature verification failed for @${challenge.githubUsername}`)
      await this.contributorOnboardingService.recordProofRejected({
        githubAccountId: challenge.githubAccountId,
        githubUsername: challenge.githubUsername,
        walletId: challenge.walletId,
        challengeId,
        reason: 'Invalid signature',
      })
      return { verified: false }
    }

    const { gpgFingerprint } = verification
    challenge.verifiedAt = new Date()
    challenge.gpgFingerprint = gpgFingerprint
    await this.challengeRepo.getEntityManager().flush()

    this.logger.log(`Signature verified for @${challenge.githubUsername} - fingerprint: ${gpgFingerprint}`)

    await this.contributorOnboardingService.recordProofAccepted({
      githubAccountId: challenge.githubAccountId,
      githubUsername: challenge.githubUsername,
      walletId: challenge.walletId,
      gpgFingerprint,
      verifiedAt: challenge.verifiedAt,
    })

    return { verified: true, gpgFingerprint }
  }

  /**
   * Returns the current GPG verification status for a GitHub contributor.
   *
   * Looks for the most recent successfully verified challenge (i.e. where
   * `verifiedAt` is not null) for the given username.  Returns
   * `isVerified: false` if no such record exists, allowing the GitHub App to
   * post an appropriate check-run outcome without throwing.
   *
   * @param githubUsername - GitHub login to look up.
   * @returns A {@link ContributorStatus} describing the contributor's state.
   */
  public async getContributorStatus(githubUsername: string): Promise<ContributorStatus> {
    const verifiedChallenge = await this.challengeRepo.findOne(
      {
        githubUsername,
        consumed: true,
        verifiedAt: { $ne: null },
      },
      { orderBy: { verifiedAt: 'DESC' } },
    )

    if (!verifiedChallenge || !verifiedChallenge.verifiedAt) {
      return { isVerified: false, githubUsername }
    }

    return {
      isVerified: true,
      githubUsername,
      gpgFingerprint: verifiedChallenge.gpgFingerprint,
      verifiedAt: verifiedChallenge.verifiedAt,
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Fetches the contributor's public GPG key(s) from GitHub.
   *
   * GitHub exposes all of a user's public GPG keys as a combined ASCII-armored
   * block at `https://github.com/<username>.gpg`.  This is the same source of
   * truth the contributor used when registering their key, so it is the
   * canonical authority for verification.
   *
   * @throws {BadRequestException} User has no GPG keys on GitHub (HTTP 404 or empty body).
   * @throws {HttpException} (429) GitHub API rate-limited the request.
   * @throws {ServiceUnavailableException} Network-level failure.
   */
  private async fetchGithubGpgKey(githubUsername: string): Promise<string> {
    if (!GITHUB_USERNAME_PATTERN.test(githubUsername)) {
      throw new BadRequestException(
        `Invalid GitHub username format: '${githubUsername}'. ` +
          'Usernames may only contain alphanumeric characters and hyphens.',
      )
    }

    const url = `${this.configService.githubConfig.usersApiUrl.replace(/\/users$/, '')}/${encodeURIComponent(githubUsername)}.gpg`

    let armoredKeys: string
    try {
      const response = await firstValueFrom(this.httpService.get<string>(url, { timeout: GITHUB_REQUEST_TIMEOUT_MS }))
      armoredKeys = response.data
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status

        if (status === 404) {
          throw new BadRequestException(
            `No public GPG key found for @${githubUsername} on GitHub. ` +
              'Upload your GPG public key at https://github.com/settings/keys ' +
              'before requesting a challenge.',
          )
        }

        if (status === 403 || status === 429) {
          throw new HttpException(
            'GitHub API rate limit reached. Please wait a few minutes before retrying.',
            HttpStatus.TOO_MANY_REQUESTS,
          )
        }

        // Network-level failures: timeout, DNS, connection refused, etc.
        throw new ServiceUnavailableException(
          'Unable to reach GitHub to fetch your GPG public key. ' + 'Check your network connection and retry.',
        )
      }

      throw error
    }

    if (!armoredKeys || armoredKeys.trim().length === 0) {
      throw new BadRequestException(
        `GitHub returned an empty GPG key for @${githubUsername}. ` +
          'Ensure your GPG key is uploaded and visible on your GitHub profile.',
      )
    }

    return armoredKeys
  }

  /**
   * Cryptographically verifies the contributor's GPG signature.
   *
   * Accepts a PGP cleartext-signed message (produced by `gpg --clearsign`)
   * and verifies it against all public keys registered on the contributor's
   * GitHub profile.  Additionally confirms that the signed content exactly
   * matches the expected nonce to prevent cross-challenge reuse attacks.
   *
   * @param expectedNonce - The nonce string that must have been signed.
   * @param armoredMessage - PGP cleartext-signed message block.
   * @param armoredKeys - ASCII-armored public key(s) from GitHub.
   * @returns `true` if the signature is cryptographically valid for the nonce;
   *   `false` if the signature is mathematically invalid.
   *
   * @throws {BadRequestException} The armored message cannot be parsed as a
   *   PGP cleartext-signed message.
   */
  private async verifyPgpSignature(
    expectedNonce: string,
    armoredMessage: string,
    armoredKeys: string,
  ): Promise<{ isValid: false } | { isValid: true; gpgFingerprint: string }> {
    const publicKeys = await this.readPublicKeys(armoredKeys)

    // Parse the armored cleartext message.  openpgp.readCleartextMessage handles
    // the `-----BEGIN PGP SIGNED MESSAGE-----` format produced by `gpg --clearsign`.
    let signedMessage: openpgp.CleartextMessage
    try {
      signedMessage = await openpgp.readCleartextMessage({ cleartextMessage: armoredMessage })
    } catch {
      throw new BadRequestException(
        'The submitted signature could not be parsed as a PGP cleartext-signed message. ' +
          'Ensure you ran: echo "<nonce>" | gpg --clearsign  ' +
          'and submitted the complete output including the BEGIN/END headers.',
      )
    }

    // Run the cryptographic verification.
    const verificationResult = await openpgp.verify({
      message: signedMessage,
      verificationKeys: publicKeys,
    })

    // `verified` is a Promise that resolves if the math checks out and rejects
    // if the signature is invalid.  Awaiting it inside a try/catch lets us
    // return `false` for a bad signature rather than throwing an unhandled error.
    let signingKeyId: openpgp.KeyID
    try {
      const { keyID, verified } = verificationResult.signatures[0]
      await verified
      signingKeyId = keyID
    } catch {
      return { isValid: false }
    }

    // Confirm the signed text matches our nonce exactly.
    // .trim() handles the trailing newline that `echo` appends before `gpg` signs.
    // This prevents cross-challenge reuse: a contributor cannot sign challenge A
    // and submit it to challenge B.
    const signedText = signedMessage.getText().trim()
    if (signedText !== expectedNonce) {
      // Do not log the signedText value — it is caller-controlled and may contain
      // sensitive or malicious content that would pollute logs.
      this.logger.warn(`Cross-challenge reuse attempt detected for challenge (expected nonce did not match signed content)`)
      return { isValid: false }
    }

    return {
      isValid: true,
      gpgFingerprint: this.extractFingerprint(publicKeys, signingKeyId),
    }
  }

  /**
   * Extracts the uppercase hex fingerprint from the key or subkey that actually
   * produced the verified signature.
   *
   * Accepts parsed `openpgp.Key[]` (not armored string) to avoid re-parsing
   * the same key block that was already processed during verification.
   *
   * The fingerprint is stored on the {@link GpgChallenge} record and will
   * eventually be included in the contributor's Verifiable Credential as a
   * cryptographic link between their GPG key and their decentralized identity.
   */
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
        'The GPG public key returned by GitHub could not be parsed. ' +
          'This may indicate a corrupted key on your GitHub profile.',
      )
    }
  }
}
