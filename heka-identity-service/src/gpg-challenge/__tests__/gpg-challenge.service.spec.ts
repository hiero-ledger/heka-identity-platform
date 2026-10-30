import { EntityManager } from '@mikro-orm/core'
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

import { AuthInfo, Role } from 'common/auth'
import { User } from 'common/entities'

import { ContributorOnboardingService } from '../../contributor-onboarding'
import { GpgChallenge } from '../gpg-challenge.entity'
import { GpgChallengeService } from '../gpg-challenge.service'

function auth(overrides: Partial<AuthInfo> = {}): AuthInfo {
  return {
    userId: 'user-1',
    user: {} as User,
    userName: 'ada',
    role: Role.User,
    walletId: 'User_user-1',
    tenantId: 'tenant-1',
    ...overrides,
  }
}

function buildChallenge(overrides: Partial<GpgChallenge> = {}): GpgChallenge {
  const challenge = new GpgChallenge()
  challenge.id = '11111111-1111-4111-8111-111111111111'
  challenge.userId = 'user-1'
  challenge.tenantId = 'tenant-1'
  challenge.walletId = 'User_user-1'
  challenge.githubAccountId = '4115704'
  challenge.githubUsername = 'test-contributor'
  challenge.nonce = 'a'.repeat(64)
  challenge.consumed = false
  challenge.expiresAt = new Date(Date.now() + 5 * 60 * 1_000)
  challenge.createdAt = new Date()
  return Object.assign(challenge, overrides)
}

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

function axiosNetworkError(): AxiosError {
  const err = new AxiosError('Network Error')
  err.code = 'ECONNREFUSED'
  return err
}

describe('GpgChallengeService', () => {
  let service: GpgChallengeService
  let em: {
    persist: ReturnType<typeof vi.fn>
    flush: ReturnType<typeof vi.fn>
    findOne: ReturnType<typeof vi.fn>
    nativeUpdate: ReturnType<typeof vi.fn>
    refresh: ReturnType<typeof vi.fn>
  }
  let httpService: { get: ReturnType<typeof vi.fn> }
  let onboarding: {
    getRequiredBindingForUser: ReturnType<typeof vi.fn>
    recordChallengeRequested: ReturnType<typeof vi.fn>
    recordProofAccepted: ReturnType<typeof vi.fn>
    recordProofRejected: ReturnType<typeof vi.fn>
    findBindingByGithubAccountId: ReturnType<typeof vi.fn>
  }

  beforeEach(() => {
    em = {
      persist: vi.fn(),
      flush: vi.fn().mockResolvedValue(undefined),
      findOne: vi.fn(),
      nativeUpdate: vi.fn().mockResolvedValue(1),
      refresh: vi.fn().mockResolvedValue(undefined),
    }
    httpService = { get: vi.fn() }
    onboarding = {
      getRequiredBindingForUser: vi.fn(),
      recordChallengeRequested: vi.fn().mockResolvedValue(undefined),
      recordProofAccepted: vi.fn().mockResolvedValue({ githubAccountId: '4115704' }),
      recordProofRejected: vi.fn().mockResolvedValue(undefined),
      findBindingByGithubAccountId: vi.fn(),
    }

    service = new GpgChallengeService(
      em as unknown as EntityManager,
      httpService as unknown as HttpService,
      onboarding as unknown as ContributorOnboardingService,
      {
        clientId: undefined,
        clientSecret: undefined,
        callbackUrl: undefined,
        authorizeUrl: 'https://github.com/login/oauth/authorize',
        tokenUrl: 'https://github.com/login/oauth/access_token',
        userApiUrl: 'https://api.github.com/user',
        gpgKeyBaseUrl: 'https://github.com',
        requestTimeoutMs: 8000,
        statusToken: undefined,
      },
    )
  })

  describe('createChallenge', () => {
    it('persists a 64-character hex nonce that expires in 5 minutes', async () => {
      const now = Date.now()
      const challenge = await service.createChallenge({
        userId: 'user-1',
        tenantId: 'tenant-1',
        walletId: 'User_user-1',
        githubAccountId: '4115704',
        githubUsername: 'test-contributor',
      })

      expect(challenge.nonce).toMatch(/^[0-9a-f]{64}$/)
      expect(challenge.consumed).toBe(false)
      expect(challenge.expiresAt.getTime()).toBeGreaterThanOrEqual(now + 5 * 60 * 1_000 - 2_000)
      expect(challenge.expiresAt.getTime()).toBeLessThanOrEqual(now + 5 * 60 * 1_000 + 2_000)
      expect(em.persist).toHaveBeenCalledWith(challenge)
      expect(em.flush).toHaveBeenCalledOnce()
    })
  })

  describe('createChallengeForUser', () => {
    it('binds the nonce to the linked GitHub account', async () => {
      onboarding.getRequiredBindingForUser.mockResolvedValue({
        githubAccountId: '4115704',
        githubUsername: 'test-contributor',
        walletId: 'User_user-1',
      })

      const challenge = await service.createChallengeForUser(auth())

      expect(challenge.githubAccountId).toBe('4115704')
      expect(challenge.userId).toBe('user-1')
      expect(onboarding.recordChallengeRequested).toHaveBeenCalledWith(
        expect.objectContaining({ challengeId: challenge.id, githubAccountId: '4115704' }),
      )
    })
  })

  describe('verifySignature guard failures', () => {
    it('throws NotFoundException for an unknown challenge', async () => {
      em.findOne.mockResolvedValue(null)
      await expect(service.verifySignature(auth(), 'missing', 'sig')).rejects.toThrow(NotFoundException)
    })

    it('throws NotFoundException when the challenge belongs to another user and does not burn it', async () => {
      em.findOne.mockResolvedValue(buildChallenge({ userId: 'user-2' }))
      await expect(service.verifySignature(auth(), '11111111-1111-4111-8111-111111111111', 'sig')).rejects.toThrow(
        NotFoundException,
      )
      expect(em.nativeUpdate).not.toHaveBeenCalled()
    })

    it('rejects a replayed challenge', async () => {
      em.findOne.mockResolvedValue(buildChallenge({ consumed: true }))
      await expect(service.verifySignature(auth(), 'id', 'sig')).rejects.toThrow(/Replay attack detected/)
    })

    it('rejects an expired challenge', async () => {
      em.findOne.mockResolvedValue(buildChallenge({ expiresAt: new Date(Date.now() - 1_000) }))
      await expect(service.verifySignature(auth(), 'id', 'sig')).rejects.toThrow(/expired/)
    })

    it('burns the challenge before calling GitHub', async () => {
      const challenge = buildChallenge()
      em.findOne.mockResolvedValue(challenge)
      httpService.get.mockImplementation(() => {
        expect(em.nativeUpdate).toHaveBeenCalledWith(
          GpgChallenge,
          { id: challenge.id, consumed: false },
          { consumed: true },
        )
        return throwError(() => axiosErrorWithStatus(404))
      })

      await expect(service.verifySignature(auth(), challenge.id, 'sig')).rejects.toThrow(BadRequestException)
    })

    it('rejects a concurrent consume when nativeUpdate matches no row', async () => {
      em.findOne.mockResolvedValue(buildChallenge())
      em.nativeUpdate.mockResolvedValue(0)
      await expect(service.verifySignature(auth(), 'id', 'sig')).rejects.toThrow(/already been consumed/)
      expect(httpService.get).not.toHaveBeenCalled()
    })
  })

  describe('verifySignature GitHub API failures', () => {
    beforeEach(() => {
      em.findOne.mockResolvedValue(buildChallenge())
    })

    it('reports a missing GitHub key', async () => {
      httpService.get.mockReturnValue(throwError(() => axiosErrorWithStatus(404)))
      await expect(service.verifySignature(auth(), 'id', 'sig')).rejects.toThrow(/No public GPG key/)
    })

    it('maps GitHub 429 and 403 to 429', async () => {
      for (const status of [429, 403]) {
        httpService.get.mockReturnValue(throwError(() => axiosErrorWithStatus(status)))
        try {
          await service.verifySignature(auth(), 'id', 'sig')
          expect.fail('expected a rate-limit error')
        } catch (err) {
          expect(err).toBeInstanceOf(HttpException)
          expect((err as HttpException).getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS)
        }
      }
    })

    it('maps network failures to ServiceUnavailableException', async () => {
      httpService.get.mockReturnValue(throwError(() => axiosNetworkError()))
      await expect(service.verifySignature(auth(), 'id', 'sig')).rejects.toThrow(ServiceUnavailableException)
    })

    it('rejects an empty key body', async () => {
      httpService.get.mockReturnValue(of({ data: '   ' }))
      await expect(service.verifySignature(auth(), 'id', 'sig')).rejects.toThrow(/empty/)
    })
  })

  describe('verifySignature cryptography', () => {
    it('rejects a message that is not a cleartext signature', async () => {
      em.findOne.mockResolvedValue(buildChallenge())
      const keyPair = await openpgp.generateKey({
        type: 'ecc',
        curve: 'curve25519Legacy',
        userIDs: [{ name: 'Test Key', email: 'test@example.com' }],
      })
      httpService.get.mockReturnValue(of({ data: keyPair.publicKey }))

      await expect(service.verifySignature(auth(), 'id', 'this is not a pgp message')).rejects.toThrow(
        /could not be parsed as a PGP cleartext-signed message/,
      )
      expect(onboarding.recordProofRejected).toHaveBeenCalledWith(
        expect.objectContaining({ challengeId: 'id', reason: 'Malformed signature' }),
      )
    })

    it('stores the fingerprint of the key that signed the nonce', async () => {
      const challenge = buildChallenge()
      em.findOne.mockResolvedValue(challenge)

      const otherKey = await openpgp.generateKey({
        type: 'ecc',
        curve: 'curve25519Legacy',
        userIDs: [{ name: 'Other', email: 'other@example.com' }],
      })
      const signingKey = await openpgp.generateKey({
        type: 'ecc',
        curve: 'curve25519Legacy',
        userIDs: [{ name: 'Signer', email: 'signer@example.com' }],
      })
      const privateKey = await openpgp.readPrivateKey({ armoredKey: signingKey.privateKey })
      const cleartext = await openpgp.createCleartextMessage({ text: challenge.nonce })
      const armoredMessage = await openpgp.sign({ message: cleartext, signingKeys: privateKey })
      const signed = await openpgp.readCleartextMessage({ cleartextMessage: armoredMessage })
      const [signingKeyId] = signed.getSigningKeyIDs()
      const publicKey = await openpgp.readKey({ armoredKey: signingKey.publicKey })
      const expectedFingerprint = publicKey.getKeys(signingKeyId)[0].getFingerprint().toUpperCase()

      httpService.get.mockReturnValue(of({ data: `${otherKey.publicKey}\n${signingKey.publicKey}` }))

      const result = await service.verifySignature(auth(), challenge.id, armoredMessage)

      expect(result).toMatchObject({ verified: true, gpgFingerprint: expectedFingerprint })
      expect(challenge.gpgFingerprint).toBe(expectedFingerprint)
      expect(onboarding.recordProofAccepted).toHaveBeenCalledWith(
        expect.objectContaining({ gpgFingerprint: expectedFingerprint, userId: 'user-1' }),
      )
    }, 30_000)

    it('does not report verified when the current binding was not updated', async () => {
      const challenge = buildChallenge()
      em.findOne.mockResolvedValue(challenge)
      onboarding.recordProofAccepted.mockResolvedValue(undefined)
      const signingKey = await openpgp.generateKey({
        type: 'ecc',
        curve: 'curve25519Legacy',
        userIDs: [{ name: 'Signer', email: 'signer@example.com' }],
      })
      const privateKey = await openpgp.readPrivateKey({ armoredKey: signingKey.privateKey })
      const cleartext = await openpgp.createCleartextMessage({ text: challenge.nonce })
      const armoredMessage = await openpgp.sign({ message: cleartext, signingKeys: privateKey })
      httpService.get.mockReturnValue(of({ data: signingKey.publicKey }))

      const result = await service.verifySignature(auth(), challenge.id, armoredMessage)

      expect(result).toMatchObject({ verified: false })
      expect(challenge.verifiedAt).toBeUndefined()
      expect(challenge.gpgFingerprint).toBeUndefined()
    }, 30_000)
  })

  describe('getContributorStatus', () => {
    it('returns unverified when GitHub has no such login', async () => {
      httpService.get.mockReturnValue(throwError(() => axiosErrorWithStatus(404)))

      await expect(service.getContributorStatus('test-contributor')).resolves.toEqual({
        isVerified: false,
        githubUsername: 'test-contributor',
      })
      expect(onboarding.findBindingByGithubAccountId).not.toHaveBeenCalled()
    })

    it('returns unverified when the current account binding has no proof', async () => {
      httpService.get.mockReturnValue(of({ data: { id: 4115704, login: 'test-contributor' } }))
      onboarding.findBindingByGithubAccountId.mockResolvedValue({
        githubAccountId: '4115704',
        githubUsername: 'old-name',
        verifiedAt: null,
        gpgFingerprint: null,
      })

      await expect(service.getContributorStatus('test-contributor')).resolves.toEqual({
        isVerified: false,
        githubUsername: 'test-contributor',
      })
      expect(onboarding.findBindingByGithubAccountId).toHaveBeenCalledWith('4115704')
      expect(em.findOne).not.toHaveBeenCalled()
    })

    it('reads verification from the account-id binding after a username change', async () => {
      const verifiedAt = new Date('2026-07-06T09:00:00Z')
      httpService.get.mockReturnValue(of({ data: { id: 4115704, login: 'renamed' } }))
      onboarding.findBindingByGithubAccountId.mockResolvedValue({
        githubAccountId: '4115704',
        githubUsername: 'old-name',
        gpgFingerprint: 'ABCDEF123456',
        verifiedAt,
      })

      await expect(service.getContributorStatus('renamed')).resolves.toMatchObject({
        isVerified: true,
        githubUsername: 'renamed',
        gpgFingerprint: 'ABCDEF123456',
        verifiedAt,
      })
      expect(httpService.get).toHaveBeenCalledWith(
        'https://api.github.com/users/renamed',
        expect.objectContaining({ headers: expect.objectContaining({ 'User-Agent': 'heka-identity-service' }) }),
      )
    })

    it('reuses the cached GitHub account id', async () => {
      httpService.get.mockReturnValue(of({ data: { id: 4115704, login: 'renamed' } }))
      onboarding.findBindingByGithubAccountId.mockResolvedValue(null)

      await service.getContributorStatus('renamed')
      await service.getContributorStatus('renamed')

      expect(httpService.get).toHaveBeenCalledOnce()
    })
  })
})
