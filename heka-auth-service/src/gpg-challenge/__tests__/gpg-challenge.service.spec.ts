/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument */
import { EntityRepository } from '@mikro-orm/postgresql'
import { HttpService } from '@nestjs/axios'
import {
  BadRequestException,
  HttpException,
  HttpStatus,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common'
import { AxiosError, AxiosHeaders } from 'axios'
import * as openpgp from 'openpgp'
import { of, throwError } from 'rxjs'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ConfigService } from '@config'

import { GpgChallenge } from '../gpg-challenge.entity'
import { GpgChallengeService } from '../gpg-challenge.service'
import { ContributorOnboardingService } from '../../contributor-onboarding'

function createMock<T extends object>(overrides: Partial<T> = {}): T {
  return overrides as T
}



/**
 * Builds a fake GpgChallenge entity with sensible defaults.
 * Individual tests override only the fields they care about.
 */
function buildChallenge(overrides: Partial<GpgChallenge> = {}): GpgChallenge {
  const challenge = new GpgChallenge()
  challenge.id = 'test-challenge-id'
  challenge.githubUsername = 'test-contributor'
  challenge.nonce = 'a'.repeat(64) // 64-char hex nonce
  challenge.consumed = false
  challenge.expiresAt = new Date(Date.now() + 5 * 60 * 1_000) // 5 minutes from now
  challenge.createdAt = new Date()
  return Object.assign(challenge, overrides)
}

/**
 * Constructs a minimal AxiosError whose `.response.status` matches `status`.
 * Used to simulate GitHub API HTTP error responses without a real HTTP call.
 */
function axiosErrorWithStatus(status: number): AxiosError {
  const err = new AxiosError('Request failed')
  err.response = {
    status,
    statusText: String(status),
    data: {},
    headers: new AxiosHeaders(),
    config: { headers: new AxiosHeaders() },
  }
  return err
}

/**
 * Constructs an AxiosError with no `.response`, simulating a network-level
 * failure such as a DNS error or connection timeout.
 */
function axiosNetworkError(): AxiosError {
  const err = new AxiosError('Network Error')
  err.code = 'ECONNREFUSED'
  // err.response is intentionally undefined
  return err
}



describe('GpgChallengeService', () => {
  let service: GpgChallengeService
  let challengeRepo: ReturnType<typeof createMock<EntityRepository<GpgChallenge>>>
  let httpService: ReturnType<typeof createMock<HttpService>>
  let contributorOnboardingService: ReturnType<typeof createMock<ContributorOnboardingService>>
  let configService: ReturnType<typeof createMock<ConfigService>>
  let entityManagerMock: {
    persist: ReturnType<typeof vi.fn>
    flush: ReturnType<typeof vi.fn>
    nativeUpdate: ReturnType<typeof vi.fn>
    refresh: ReturnType<typeof vi.fn>
  }

  beforeEach(() => {
    entityManagerMock = {
      persist: vi.fn().mockReturnThis(),
      flush: vi.fn().mockResolvedValue(undefined),
      nativeUpdate: vi.fn().mockResolvedValue(1), // default: 1 row updated (consumed successfully)
      refresh: vi.fn().mockResolvedValue(undefined),
    }

    challengeRepo = createMock<EntityRepository<GpgChallenge>>({
      create: vi.fn(),
      findOne: vi.fn(),
      getEntityManager: vi.fn().mockReturnValue(entityManagerMock),
    })

    httpService = createMock<HttpService>({
      get: vi.fn(),
    })

    contributorOnboardingService = createMock<ContributorOnboardingService>({
      getRequiredBindingForWallet: vi.fn(),
      recordProofAccepted: vi.fn(),
      recordProofRejected: vi.fn(),
    })

    configService = createMock<ConfigService>({
      githubConfig: {
        usersApiUrl: 'https://api.github.com/users',
        requestTimeoutMs: 8000,
      } as any,
    })

    service = new GpgChallengeService(challengeRepo, httpService, contributorOnboardingService, configService)
  })



  describe('createChallenge', () => {
    it('persists a challenge with a 64-character hex nonce', async () => {
      const createdChallenge = buildChallenge()
      vi.mocked(challengeRepo.create).mockReturnValue(createdChallenge)

      await service.createChallenge({ githubUsername: 'test-contributor' })

      expect(challengeRepo.create).toHaveBeenCalledOnce()
      const arg = vi.mocked(challengeRepo.create).mock.calls[0][0]

      // 32 random bytes -> 64 hex characters
      expect(arg.nonce).toMatch(/^[0-9a-f]{64}$/)
    })

    it('sets the TTL to exactly 5 minutes from now (within a 2-second margin)', async () => {
      const now = Date.now()
      const createdChallenge = buildChallenge()
      vi.mocked(challengeRepo.create).mockReturnValue(createdChallenge)

      await service.createChallenge({ githubUsername: 'test-contributor' })

      const arg = vi.mocked(challengeRepo.create).mock.calls[0][0] as Partial<GpgChallenge>
      const expectedExpiry = now + 5 * 60 * 1_000
      expect(arg.expiresAt).toBeInstanceOf(Date)
      expect(arg.expiresAt!.getTime()).toBeGreaterThanOrEqual(expectedExpiry - 2_000)
      expect(arg.expiresAt!.getTime()).toBeLessThanOrEqual(expectedExpiry + 2_000)
    })

    it('creates a challenge with consumed defaulting to false', async () => {
      const createdChallenge = buildChallenge()
      vi.mocked(challengeRepo.create).mockReturnValue(createdChallenge)

      await service.createChallenge({ githubUsername: 'test-contributor' })

      const arg = vi.mocked(challengeRepo.create).mock.calls[0][0]
      expect(arg.consumed).toBe(false)
    })

    it('persists the entity before returning', async () => {
      const createdChallenge = buildChallenge()
      vi.mocked(challengeRepo.create).mockReturnValue(createdChallenge)

      await service.createChallenge({ githubUsername: 'test-contributor' })

      expect(entityManagerMock.persist).toHaveBeenCalledWith(createdChallenge)
    })
  })



  describe('verifySignature guard failures', () => {
    it('throws NotFoundException for an unknown challengeId', async () => {
      vi.mocked(challengeRepo.findOne).mockResolvedValue(null)

      await expect(service.verifySignature('unknown-id', 'sig')).rejects.toThrow(NotFoundException)
    })

    it('throws BadRequestException on replay attack (consumed challenge)', async () => {
      vi.mocked(challengeRepo.findOne).mockResolvedValue(buildChallenge({ consumed: true }))

      await expect(service.verifySignature('test-challenge-id', 'sig')).rejects.toThrow(
        expect.objectContaining({ message: expect.stringContaining('Replay attack detected') }),
      )
    })

    it('throws BadRequestException for an expired challenge', async () => {
      vi.mocked(challengeRepo.findOne).mockResolvedValue(buildChallenge({ expiresAt: new Date(Date.now() - 1_000) }))

      await expect(service.verifySignature('test-challenge-id', 'sig')).rejects.toThrow(
        expect.objectContaining({ message: expect.stringContaining('expired') }),
      )
    })
  })



  describe('verifySignature burn-before-verify ordering', () => {
    it('atomically claims the challenge via nativeUpdate BEFORE making any GitHub API call', async () => {
      const challenge = buildChallenge()
      vi.mocked(challengeRepo.findOne).mockResolvedValue(challenge)

      // nativeUpdate returns 1 (row claimed). GitHub call will fail; we only care what happens before it.
      entityManagerMock.nativeUpdate.mockResolvedValue(1)
      vi.mocked(httpService.get).mockImplementation(() => {
        expect(entityManagerMock.nativeUpdate).toHaveBeenCalledOnce()
        expect(entityManagerMock.nativeUpdate).toHaveBeenCalledWith(
          expect.anything(),
          { id: 'test-challenge-id', consumed: false },
          { consumed: true },
        )
        return throwError(() => axiosErrorWithStatus(404))
      })

      await expect(service.verifySignature('test-challenge-id', 'sig')).rejects.toThrow(BadRequestException)
    })

    it('throws BadRequestException when nativeUpdate returns 0 (concurrent consumption)', async () => {
      const challenge = buildChallenge()
      vi.mocked(challengeRepo.findOne).mockResolvedValue(challenge)
      entityManagerMock.nativeUpdate.mockResolvedValue(0) // another request already consumed it

      await expect(service.verifySignature('test-challenge-id', 'sig')).rejects.toThrow(
        expect.objectContaining({ message: expect.stringContaining('already been consumed') }),
      )
    })
  })



  describe('verifySignature GitHub API failures', () => {
    beforeEach(() => {
      vi.mocked(challengeRepo.findOne).mockResolvedValue(buildChallenge())
    })

    it('throws BadRequestException when GitHub returns 404 (no GPG key)', async () => {
      vi.mocked(httpService.get).mockReturnValue(throwError(() => axiosErrorWithStatus(404)))

      await expect(service.verifySignature('test-challenge-id', 'sig')).rejects.toThrow(
        expect.objectContaining({ message: expect.stringContaining('No public GPG key') }),
      )
    })

    it('throws HttpException(429) when GitHub returns 429 (rate limit)', async () => {
      vi.mocked(httpService.get).mockReturnValue(throwError(() => axiosErrorWithStatus(429)))

      try {
        await service.verifySignature('test-challenge-id', 'sig')
        expect.fail('Expected HttpException to be thrown')
      } catch (err) {
        expect(err).toBeInstanceOf(HttpException)
        expect((err as HttpException).getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS)
      }
    })

    it('throws HttpException(429) when GitHub returns 403 (rate limit)', async () => {
      vi.mocked(httpService.get).mockReturnValue(throwError(() => axiosErrorWithStatus(403)))

      try {
        await service.verifySignature('test-challenge-id', 'sig')
        expect.fail('Expected HttpException to be thrown')
      } catch (err) {
        expect(err).toBeInstanceOf(HttpException)
        expect((err as HttpException).getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS)
      }
    })

    it('throws ServiceUnavailableException on network-level failure', async () => {
      vi.mocked(httpService.get).mockReturnValue(throwError(() => axiosNetworkError()))

      await expect(service.verifySignature('test-challenge-id', 'sig')).rejects.toThrow(ServiceUnavailableException)
    })

    it('throws BadRequestException when GitHub returns an empty body', async () => {
      vi.mocked(httpService.get).mockReturnValue(
        of({ data: '   ', status: 200, statusText: 'OK', headers: {}, config: {} } as any),
      )

      await expect(service.verifySignature('test-challenge-id', 'sig')).rejects.toThrow(
        expect.objectContaining({ message: expect.stringContaining('empty') }),
      )
    })
  })

  // -----------------------------------------------------------------------
  // verifySignature cryptographic failures
  // -----------------------------------------------------------------------

  describe('verifySignature cryptographic failures', () => {
    beforeEach(async () => {
      const keyPair = await openpgp.generateKey({
        type: 'ecc',
        curve: 'curve25519Legacy',
        userIDs: [{ name: 'Test Key', email: 'test@example.com' }],
      })

      vi.mocked(challengeRepo.findOne).mockResolvedValue(buildChallenge())
      vi.mocked(httpService.get).mockReturnValue(
        of({
          data: keyPair.publicKey,
          status: 200,
          statusText: 'OK',
          headers: {},
          config: {},
        } as any),
      )
    })

    it('throws when the armored message cannot be parsed as a PGP cleartext message', async () => {
      // A string that is not a PGP armored block at all will cause openpgp to
      // throw before (or inside) our try/catch; the service must bubble it as an
      // error regardless of the exception type.
      await expect(service.verifySignature('test-challenge-id', 'this is not a pgp message')).rejects.toThrow(
        expect.objectContaining({
          message: expect.stringContaining('could not be parsed as a PGP cleartext-signed message'),
        }),
      )
    })
  })

  // -----------------------------------------------------------------------
  // verifySignature cryptographic success
  // -----------------------------------------------------------------------

  describe('verifySignature cryptographic success', () => {
    it('stores the fingerprint of the key that actually signed the nonce', async () => {
      const challenge = buildChallenge()
      vi.mocked(challengeRepo.findOne).mockResolvedValue(challenge)

      const firstKeyPair = await openpgp.generateKey({
        type: 'ecc',
        curve: 'curve25519Legacy',
        userIDs: [{ name: 'First Test Key', email: 'first@example.com' }],
      })
      const signingKeyPair = await openpgp.generateKey({
        type: 'ecc',
        curve: 'curve25519Legacy',
        userIDs: [{ name: 'Signing Test Key', email: 'signing@example.com' }],
      })

      const privateSigningKey = await openpgp.readPrivateKey({ armoredKey: signingKeyPair.privateKey })
      const cleartextMessage = await openpgp.createCleartextMessage({ text: challenge.nonce })
      const armoredMessage = await openpgp.sign({ message: cleartextMessage, signingKeys: privateSigningKey })
      const signedMessage = await openpgp.readCleartextMessage({ cleartextMessage: armoredMessage })
      const [signingKeyId] = signedMessage.getSigningKeyIDs()
      const publicSigningKey = await openpgp.readKey({ armoredKey: signingKeyPair.publicKey })
      const expectedFingerprint = publicSigningKey.getKeys(signingKeyId)[0].getFingerprint().toUpperCase()

      vi.mocked(httpService.get).mockReturnValue(
        of({
          data: `${firstKeyPair.publicKey}\n${signingKeyPair.publicKey}`,
          status: 200,
          statusText: 'OK',
          headers: {},
          config: {},
        } as any),
      )

      const result = await service.verifySignature(challenge.id, armoredMessage)

      expect(result).toEqual({ verified: true, gpgFingerprint: expectedFingerprint })
      expect(challenge.gpgFingerprint).toBe(expectedFingerprint)
    }, 30_000)
  })

  // -----------------------------------------------------------------------
  // getContributorStatus
  // -----------------------------------------------------------------------

  describe('getContributorStatus', () => {
    it('returns isVerified: false when no verified challenge exists', async () => {
      vi.mocked(challengeRepo.findOne).mockResolvedValue(null)

      const result = await service.getContributorStatus('test-contributor')

      expect(result.isVerified).toBe(false)
      expect(result.githubUsername).toBe('test-contributor')
    })

    it('returns isVerified: true with fingerprint and timestamp when a verified challenge exists', async () => {
      const verifiedAt = new Date('2026-07-06T09:00:00Z')
      vi.mocked(challengeRepo.findOne).mockResolvedValue(
        buildChallenge({
          consumed: true,
          verifiedAt,
          gpgFingerprint: 'ABCDEF123456',
        }),
      )

      const result = await service.getContributorStatus('test-contributor')

      expect(result.isVerified).toBe(true)
      expect(result.gpgFingerprint).toBe('ABCDEF123456')
      expect(result.verifiedAt).toEqual(verifiedAt)
    })
  })
})
