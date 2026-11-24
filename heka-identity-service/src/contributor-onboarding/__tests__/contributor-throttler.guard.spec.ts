import { ExecutionContext, HttpStatus } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { ThrottlerException, ThrottlerStorageService } from '@nestjs/throttler'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { AuthInfo } from 'common/auth'

import { CONTRIBUTOR_RATE_LIMIT, ContributorThrottlerGuard } from '../contributor-throttler.guard'

class ContributorRoutes {}
// Two route handlers: the storage key includes the handler's name
const verify = (): undefined => undefined
const offer = (): undefined => undefined

function context(userId: string, handler: () => void = verify): ExecutionContext {
  const req = { user: { userId } as AuthInfo, ip: '203.0.113.7', headers: {} }
  const res = { header: () => undefined }
  return {
    getHandler: () => handler,
    getClass: () => ContributorRoutes,
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
  } as unknown as ExecutionContext
}

describe('ContributorThrottlerGuard', () => {
  let storage: ThrottlerStorageService
  let guard: ContributorThrottlerGuard

  beforeEach(async () => {
    storage = new ThrottlerStorageService()
    // The demo broker's throttler from the global ThrottlerModule options; this guard must not apply it
    guard = new ContributorThrottlerGuard(
      { throttlers: [{ name: 'demo-token', ttl: 60_000, limit: 1 }] },
      storage,
      new Reflector(),
    )
    await guard.onModuleInit()
  })

  afterEach(() => {
    storage.onApplicationShutdown()
  })

  it(`answers 429 to the ${CONTRIBUTOR_RATE_LIMIT + 1}th request of a user within a minute`, async () => {
    for (let i = 0; i < CONTRIBUTOR_RATE_LIMIT; i++) {
      await expect(guard.canActivate(context('alice'))).resolves.toBe(true)
    }

    const error = await guard.canActivate(context('alice')).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ThrottlerException)
    expect((error as ThrottlerException).getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS)
  })

  it('counts per user and per route, not per IP address', async () => {
    for (let i = 0; i < CONTRIBUTOR_RATE_LIMIT; i++) {
      await guard.canActivate(context('alice'))
    }

    await expect(guard.canActivate(context('bob'))).resolves.toBe(true)
    await expect(guard.canActivate(context('alice', offer))).resolves.toBe(true)
  })
})
