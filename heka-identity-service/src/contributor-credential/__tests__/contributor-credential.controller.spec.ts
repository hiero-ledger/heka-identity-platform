import { ExecutionContext } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { ThrottlerException, ThrottlerStorageService } from '@nestjs/throttler'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { AuthInfo } from 'common/auth'
import { CONTRIBUTOR_RATE_LIMIT, ContributorThrottlerGuard } from 'contributor-onboarding/contributor-throttler.guard'

import { ContributorCredentialController } from '../contributor-credential.controller'

function context(handler: (...args: never[]) => unknown): ExecutionContext {
  const req = { user: { userId: 'alice' } as AuthInfo, ip: '203.0.113.7', headers: {} }
  const res = { header: () => undefined }
  return {
    getHandler: () => handler,
    getClass: () => ContributorCredentialController,
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
  } as unknown as ExecutionContext
}

async function acceptedRequests(guard: ContributorThrottlerGuard, handler: (...args: never[]) => unknown) {
  let accepted = 0
  for (;;) {
    try {
      await guard.canActivate(context(handler))
      accepted += 1
    } catch (error) {
      expect(error).toBeInstanceOf(ThrottlerException)
      return accepted
    }
  }
}

describe('ContributorCredentialController rate limits', () => {
  let storage: ThrottlerStorageService
  let guard: ContributorThrottlerGuard

  beforeEach(async () => {
    storage = new ThrottlerStorageService()
    guard = new ContributorThrottlerGuard({ throttlers: [] }, storage, new Reflector())
    await guard.onModuleInit()
  })

  afterEach(() => {
    storage.onApplicationShutdown()
  })

  it('accepts 10 offers per minute per user', async () => {
    await expect(acceptedRequests(guard, ContributorCredentialController.prototype.createOffer)).resolves.toBe(
      CONTRIBUTOR_RATE_LIMIT,
    )
  })

  it("accepts 60 offer state reads per minute per user: the web UI polls an offer's state every 2 seconds", async () => {
    await expect(acceptedRequests(guard, ContributorCredentialController.prototype.getOfferState)).resolves.toBe(60)
  })
})
