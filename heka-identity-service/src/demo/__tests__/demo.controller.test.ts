import { createMock } from '@golevelup/ts-vitest'
import { BadGatewayException, NotFoundException } from '@nestjs/common'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { Logger } from 'common/logger'

import { DemoTokenProvider } from '../demo-token.provider'
import { DemoController } from '../demo.controller'

describe('DemoController', () => {
  let provider: DemoTokenProvider
  let controller: DemoController

  beforeEach(() => {
    provider = createMock<DemoTokenProvider>()
    controller = new DemoController(provider, createMock<Logger>())
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test('answers 404 when the broker is not enabled', async () => {
    Object.defineProperty(provider, 'enabled', { value: false })

    await expect(controller.getToken()).rejects.toBeInstanceOf(NotFoundException)
    expect(provider.getToken).not.toHaveBeenCalled()
  })

  test('returns an OAuth-shaped token response with the remaining lifetime', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-21T10:00:00Z'))
    Object.defineProperty(provider, 'enabled', { value: true })
    vi.mocked(provider.getToken).mockResolvedValue({ accessToken: 'demo-token', expiresAt: Date.now() + 299_500 })

    await expect(controller.getToken()).resolves.toEqual({
      access_token: 'demo-token',
      token_type: 'Bearer',
      expires_in: 299,
    })
  })

  test('answers 502 when the provider cannot issue a token', async () => {
    Object.defineProperty(provider, 'enabled', { value: true })
    vi.mocked(provider.getToken).mockRejectedValue(new Error('token endpoint is unreachable'))

    await expect(controller.getToken()).rejects.toBeInstanceOf(BadGatewayException)
  })
})
