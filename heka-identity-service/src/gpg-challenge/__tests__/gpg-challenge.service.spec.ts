import { createMock } from '@golevelup/ts-vitest'
import { EntityManager } from '@mikro-orm/core'
import { HttpService } from '@nestjs/axios'
import {
  BadRequestException,
  HttpException,
  HttpStatus,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common'
import { AxiosError, AxiosHeaders, type AxiosResponse } from 'axios'
import * as openpgp from 'openpgp'
import { Observable, of, throwError } from 'rxjs'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AuthInfo, Role } from 'common/auth'
import { User } from 'common/entities'
import { Logger } from 'common/logger'
import { GithubConfig, githubConfigDefaults } from 'config/github'

import { ContributorOnboardingService } from '../../contributor-onboarding'
import { GpgChallenge } from '../gpg-challenge.entity'
import { GpgChallengeService } from '../gpg-challenge.service'

const MINUTE_MS = 60 * 1000
const DAY_MS = 24 * 60 * MINUTE_MS

/** The defaults, as deployed: the key URL must come from `gpgKeyBaseUrl`, never from the REST API root. */
const githubConfig: GithubConfig = {
  enabled: true,
  ...githubConfigDefaults,
  clientId: 'client-id',
  clientSecret: 'client-secret',
  callbackUrl: 'http://localhost:8000/github/callback',
  tokenRevocationUrl: 'https://api.github.com/applications/client-id/token',
}

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

function axiosResponse<T>(data: T, status = 200): AxiosResponse<T> {
  return {
    data,
    status,
    statusText: status === 200 ? 'OK' : String(status),
    headers: new AxiosHeaders(),
    config: { headers: new AxiosHeaders() },
  }
}

function httpOk<T>(data: T): Observable<AxiosResponse<T>> {
  return of(axiosResponse(data))
}

function httpFail(error: AxiosError): Observable<AxiosResponse<never>> {
  return throwError(() => error)
}

function mockLinkedAccountThen(httpGet: ReturnType<typeof vi.fn>, gpg: Observable<AxiosResponse<unknown>>) {
  httpGet.mockImplementation((url: string): Observable<AxiosResponse<unknown>> => {
    if (String(url).includes('/users/')) return httpOk({ id: 4115704, login: 'test-contributor' })
    return gpg
  })
}

async function clearSign(text: string, armoredPrivateKey: string, date?: Date): Promise<string> {
  const signingKeys = await openpgp.readPrivateKey({ armoredKey: armoredPrivateKey })
  return openpgp.sign({ message: await openpgp.createCleartextMessage({ text }), signingKeys, date })
}

describe('GpgChallengeService', () => {
  let service: GpgChallengeService
  let em: {
    persist: ReturnType<typeof vi.fn>
    flush: ReturnType<typeof vi.fn>
    findOne: ReturnType<typeof vi.fn>
    nativeUpdate: ReturnType<typeof vi.fn>
    nativeDelete: ReturnType<typeof vi.fn>
    refresh: ReturnType<typeof vi.fn>
  }
  let httpService: { get: ReturnType<typeof vi.fn> }
  let onboarding: {
    getRequiredBindingForUser: ReturnType<typeof vi.fn>
    recordChallengeRequested: ReturnType<typeof vi.fn>
    recordProofAccepted: ReturnType<typeof vi.fn>
    recordProofRejected: ReturnType<typeof vi.fn>
  }

  beforeEach(() => {
    em = {
      persist: vi.fn(),
      flush: vi.fn().mockResolvedValue(undefined),
      findOne: vi.fn(),
      nativeUpdate: vi.fn().mockResolvedValue(1),
      nativeDelete: vi.fn().mockResolvedValue(0),
      refresh: vi.fn().mockResolvedValue(undefined),
    }
    httpService = { get: vi.fn() }
    onboarding = {
      getRequiredBindingForUser: vi.fn(),
      recordChallengeRequested: vi.fn().mockResolvedValue(undefined),
      recordProofAccepted: vi.fn().mockResolvedValue({ githubAccountId: '4115704' }),
      recordProofRejected: vi.fn().mockResolvedValue(undefined),
    }

    service = new GpgChallengeService(
      em as unknown as EntityManager,
      httpService as unknown as HttpService,
      onboarding as unknown as ContributorOnboardingService,
      githubConfig,
      createMock<Logger>(),
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

    it('purges challenges that expired more than one TTL ago first', async () => {
      const before = Date.now()

      await service.createChallenge({
        userId: 'user-1',
        tenantId: 'tenant-1',
        walletId: 'User_user-1',
        githubAccountId: '4115704',
        githubUsername: 'test-contributor',
      })

      expect(em.nativeDelete).toHaveBeenCalledWith(GpgChallenge, { expiresAt: { $lt: expect.any(Date) } })
      const cutoff = (em.nativeDelete.mock.calls[0][1] as { expiresAt: { $lt: Date } }).expiresAt.$lt.getTime()
      expect(cutoff).toBeGreaterThanOrEqual(before - 5 * MINUTE_MS)
      expect(cutoff).toBeLessThanOrEqual(Date.now() - 5 * MINUTE_MS)
      expect(em.nativeDelete.mock.invocationCallOrder[0]).toBeLessThan(em.persist.mock.invocationCallOrder[0])
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
      httpService.get.mockImplementation((url: string) => {
        expect(em.nativeUpdate).toHaveBeenCalledWith(
          GpgChallenge,
          { id: challenge.id, consumed: false },
          { consumed: true },
        )
        if (String(url).includes('/users/')) return httpOk({ id: 4115704, login: 'test-contributor' })
        return httpFail(axiosErrorWithStatus(404))
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
      mockLinkedAccountThen(httpService.get, httpFail(axiosErrorWithStatus(404)))
      await expect(service.verifySignature(auth(), 'id', 'sig')).rejects.toThrow(/No public GPG key/)
    })

    it('fetches the key from <gpgKeyBaseUrl>/<login>.gpg, not from the REST API root', async () => {
      mockLinkedAccountThen(httpService.get, httpFail(axiosErrorWithStatus(404)))

      await expect(service.verifySignature(auth(), 'id', 'sig')).rejects.toThrow(BadRequestException)

      expect(httpService.get).toHaveBeenCalledWith('https://github.com/test-contributor.gpg', expect.anything())
    })

    it('maps GitHub 429 and 403 to 429', async () => {
      for (const status of [429, 403]) {
        httpService.get.mockReturnValue(httpFail(axiosErrorWithStatus(status)))
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
      httpService.get.mockReturnValue(httpFail(axiosNetworkError()))
      await expect(service.verifySignature(auth(), 'id', 'sig')).rejects.toThrow(ServiceUnavailableException)
    })

    it('rejects an empty key body', async () => {
      mockLinkedAccountThen(httpService.get, httpOk('   '))
      await expect(service.verifySignature(auth(), 'id', 'sig')).rejects.toThrow(/empty/)
    })

    it('does not fetch a GPG key when the login now belongs to another account', async () => {
      em.findOne.mockResolvedValue(buildChallenge())
      httpService.get.mockImplementation((url: string) => {
        if (String(url).includes('/users/')) return httpOk({ id: 999, login: 'test-contributor' })
        return httpOk('should-not-fetch')
      })

      const result = await service.verifySignature(auth(), 'id', 'sig')

      expect(result).toMatchObject({
        verified: false,
        message: expect.stringMatching(/Link GitHub again/),
      })
      expect(httpService.get).toHaveBeenCalledTimes(1)
      expect(String(httpService.get.mock.calls[0][0])).toContain('/users/test-contributor')
      expect(onboarding.recordProofRejected).toHaveBeenCalledWith(
        expect.objectContaining({ reason: 'GitHub login no longer matches the linked account' }),
      )
    })

    it('does not fetch a GPG key when the stored login no longer exists', async () => {
      em.findOne.mockResolvedValue(buildChallenge())
      httpService.get.mockReturnValue(httpFail(axiosErrorWithStatus(404)))

      const result = await service.verifySignature(auth(), 'id', 'sig')

      expect(result.verified).toBe(false)
      expect(httpService.get).toHaveBeenCalledTimes(1)
      expect(String(httpService.get.mock.calls[0][0])).not.toContain('.gpg')
      expect(onboarding.recordProofRejected).toHaveBeenCalledWith(
        expect.objectContaining({ reason: 'GitHub login no longer matches the linked account' }),
      )
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
      mockLinkedAccountThen(httpService.get, httpOk(keyPair.publicKey))

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

      mockLinkedAccountThen(httpService.get, httpOk(`${otherKey.publicKey}\n${signingKey.publicKey}`))

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
      mockLinkedAccountThen(httpService.get, httpOk(signingKey.publicKey))

      const result = await service.verifySignature(auth(), challenge.id, armoredMessage)

      expect(result).toMatchObject({ verified: false })
      expect(challenge.verifiedAt).toBeUndefined()
      expect(challenge.gpgFingerprint).toBeUndefined()
    }, 30_000)

    it('accepts the challenge of the same user after a role change, and passes the current wallet on', async () => {
      const challenge = buildChallenge()
      em.findOne.mockResolvedValue(challenge)
      const key = await openpgp.generateKey({ userIDs: [{ name: 'Signer' }] })
      mockLinkedAccountThen(httpService.get, httpOk(key.publicKey))

      const result = await service.verifySignature(
        auth({ role: Role.Admin, walletId: 'Administration', tenantId: 'tenant-admin' }),
        challenge.id,
        await clearSign(challenge.nonce, key.privateKey),
      )

      expect(result.verified).toBe(true)
      expect(onboarding.recordProofAccepted).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-1', walletId: 'Administration', tenantId: 'tenant-admin' }),
      )
    }, 30_000)
  })

  /**
   * openpgp judges the key at the signature's creation time, which the signer sets. A key that
   * expired or was superseded must not prove ownership through a backdated signature.
   */
  describe('verifySignature signature time and key validity', () => {
    const now = () => Date.now()

    async function verifyWith(challenge: GpgChallenge, armoredPublicKey: string, signature: string) {
      em.findOne.mockResolvedValue(challenge)
      mockLinkedAccountThen(httpService.get, httpOk(armoredPublicKey))
      return service.verifySignature(auth(), challenge.id, signature)
    }

    function expectRejected(reason: string) {
      expect(onboarding.recordProofRejected).toHaveBeenCalledWith(expect.objectContaining({ reason }))
      expect(onboarding.recordProofAccepted).not.toHaveBeenCalled()
    }

    it('accepts a signature made now with a valid key', async () => {
      const challenge = buildChallenge()
      const key = await openpgp.generateKey({ userIDs: [{ name: 'Valid' }] })

      const result = await verifyWith(challenge, key.publicKey, await clearSign(challenge.nonce, key.privateKey))

      expect(result.verified).toBe(true)
    }, 30_000)

    it('accepts a signature dated up to 5 minutes ahead of this clock', async () => {
      const challenge = buildChallenge()
      const key = await openpgp.generateKey({ userIDs: [{ name: 'Ahead' }] })
      const signature = await clearSign(challenge.nonce, key.privateKey, new Date(now() + 2 * MINUTE_MS))

      const result = await verifyWith(challenge, key.publicKey, signature)

      expect(result.verified).toBe(true)
    }, 30_000)

    it('rejects an expired key with a signature backdated to its validity, with 400', async () => {
      const challenge = buildChallenge()
      const expired = await openpgp.generateKey({
        userIDs: [{ name: 'Expired' }],
        date: new Date(now() - 10 * DAY_MS),
        keyExpirationTime: 5 * 24 * 60 * 60,
      })
      const signature = await clearSign(challenge.nonce, expired.privateKey, new Date(now() - 8 * DAY_MS))

      await expect(verifyWith(challenge, expired.publicKey, signature)).rejects.toThrow(
        /outside this challenge's window/,
      )
      expectRejected('Signature time outside the challenge window')
    }, 30_000)

    it('rejects a superseded (soft-revoked) key with a backdated signature, with 400', async () => {
      const challenge = buildChallenge()
      const key = await openpgp.generateKey({ userIDs: [{ name: 'Superseded' }], date: new Date(now() - 10 * DAY_MS) })
      const { publicKey: revoked } = await openpgp.revokeKey({
        key: await openpgp.readPrivateKey({ armoredKey: key.privateKey }),
        reasonForRevocation: { flag: openpgp.enums.reasonForRevocation.keySuperseded, string: 'superseded' },
      })
      const signature = await clearSign(challenge.nonce, key.privateKey, new Date(now() - 8 * DAY_MS))

      await expect(verifyWith(challenge, revoked, signature)).rejects.toThrow(/outside this challenge's window/)
      expectRejected('Signature time outside the challenge window')
    }, 30_000)

    it('rejects a signature made before the challenge was issued', async () => {
      const challenge = buildChallenge()
      const key = await openpgp.generateKey({ userIDs: [{ name: 'Early' }], date: new Date(now() - DAY_MS) })
      const signature = await clearSign(challenge.nonce, key.privateKey, new Date(now() - 10 * MINUTE_MS))

      await expect(verifyWith(challenge, key.publicKey, signature)).rejects.toThrow(BadRequestException)
      expectRejected('Signature time outside the challenge window')
    }, 30_000)

    it('rejects a key that was valid at signature time but has expired since', async () => {
      const challenge = buildChallenge({ createdAt: new Date(now() - MINUTE_MS) })
      // Expired 3 minutes ago; the signature is from 4 minutes ago, inside the challenge window
      const key = await openpgp.generateKey({
        userIDs: [{ name: 'Expired since' }],
        date: new Date(now() - DAY_MS),
        keyExpirationTime: DAY_MS / 1000 - 3 * 60,
      })
      const signature = await clearSign(challenge.nonce, key.privateKey, new Date(now() - 4 * MINUTE_MS))

      await expect(verifyWith(challenge, key.publicKey, signature)).rejects.toThrow(/expired or revoked/)
      expectRejected('Signing key expired or revoked')
    }, 30_000)

    it('rejects a key that was superseded after the signature was made', async () => {
      const challenge = buildChallenge({ createdAt: new Date(now() - MINUTE_MS) })
      const key = await openpgp.generateKey({ userIDs: [{ name: 'Superseded since' }], date: new Date(now() - DAY_MS) })
      const { publicKey: revoked } = await openpgp.revokeKey({
        key: await openpgp.readPrivateKey({ armoredKey: key.privateKey }),
        reasonForRevocation: { flag: openpgp.enums.reasonForRevocation.keySuperseded, string: 'superseded' },
        date: new Date(now() - MINUTE_MS),
      })
      const signature = await clearSign(challenge.nonce, key.privateKey, new Date(now() - 4 * MINUTE_MS))

      await expect(verifyWith(challenge, revoked, signature)).rejects.toThrow(/expired or revoked/)
      expectRejected('Signing key expired or revoked')
    }, 30_000)
  })
})
