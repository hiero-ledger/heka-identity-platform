import { GUARDS_METADATA } from '@nestjs/common/constants'

import { IntrospectResponse } from '../../src/oauth/dto'
import { BearerGuard } from '../../src/oauth/guards'
import { OAuthController } from '../../src/oauth/oauth.controller'
import type { OAuthService } from '../../src/oauth/oauth.service'

// Metadata key written by `@SkipThrottle()` for the default throttler (`THROTTLER_SKIP` + name in @nestjs/throttler,
// which does not export the constant publicly).
const SKIP_DEFAULT_THROTTLER = 'THROTTLER:SKIPdefault'

describe('OAuthController.introspect', () => {
  const introspect = OAuthController.prototype.introspect

  it('should be exempt from the global throttler', () => {
    // The Identity Service calls this endpoint for every authenticated request from a single address.
    expect(Reflect.getMetadata(SKIP_DEFAULT_THROTTLER, introspect)).toBe(true)
  })

  it('should require a Bearer token via BearerGuard only', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, introspect)).toEqual([BearerGuard])
  })

  it.each([true, false])('should return { active: %s } as reported by the service', async (active) => {
    const service = { isAccessTokenActive: vi.fn().mockResolvedValue(active) }
    const controller = new OAuthController(service as unknown as OAuthService)

    const result = await controller.introspect('access-jwt')

    expect(service.isAccessTokenActive).toHaveBeenCalledWith('access-jwt')
    expect(result).toBeInstanceOf(IntrospectResponse)
    expect(result).toEqual({ active })
  })
})
