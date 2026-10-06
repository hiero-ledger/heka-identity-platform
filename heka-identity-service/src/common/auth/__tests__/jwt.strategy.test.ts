import type { Request } from 'express'

import { createMock } from '@golevelup/ts-vitest'
import { UnauthorizedException } from '@nestjs/common'

import { Role } from 'common/auth'
import { Logger } from 'common/logger'

import { AuthInfo } from '../auth-info.interface'
import { AuthService } from '../auth.service'
import { JwtStrategy } from '../jwt.strategy'
import { TokenPayload } from '../token-payload.interface'
import { TokenRevocationService } from '../token-revocation.service'

describe('JwtStrategy', () => {
  const payload: TokenPayload = { sub: '11', org_id: '7', name: 'test', roles: [Role.Issuer] }
  const authInfo = { userId: '11' } as AuthInfo

  let strategy: JwtStrategy
  let authService: { validateTokenPayload: ReturnType<typeof vi.fn> }
  let tokenRevocation: { assertTokenActive: ReturnType<typeof vi.fn> }

  const requestWith = (authorization?: string) => ({ headers: { authorization } }) as unknown as Request

  beforeEach(() => {
    authService = { validateTokenPayload: vi.fn().mockResolvedValue(authInfo) }
    tokenRevocation = { assertTokenActive: vi.fn().mockResolvedValue(undefined) }
    strategy = new JwtStrategy(
      createMock<Logger>(),
      authService as unknown as AuthService,
      tokenRevocation as unknown as TokenRevocationService,
      { secret: 'test', verifyOptions: { issuer: 'Heka', audience: 'Heka Identity Service' } },
    )
  })

  test('passes the request to validate', () => {
    // passport-jwt keeps the options on the strategy instance
    expect((strategy as unknown as { _passReqToCallback: boolean })._passReqToCallback).toBe(true)
  })

  test('checks revocation with the raw bearer token before validating the payload', async () => {
    const result = await strategy.validate(requestWith('Bearer raw-jwt'), payload)

    expect(tokenRevocation.assertTokenActive).toHaveBeenCalledWith('raw-jwt')
    expect(authService.validateTokenPayload).toHaveBeenCalledWith(payload)
    expect(tokenRevocation.assertTokenActive.mock.invocationCallOrder[0]).toBeLessThan(
      authService.validateTokenPayload.mock.invocationCallOrder[0],
    )
    expect(result).toBe(authInfo)
  })

  test('does not validate the payload when the token is revoked', async () => {
    tokenRevocation.assertTokenActive.mockRejectedValue(new UnauthorizedException())

    await expect(strategy.validate(requestWith('Bearer revoked-jwt'), payload)).rejects.toThrow(UnauthorizedException)

    expect(authService.validateTokenPayload).not.toHaveBeenCalled()
  })

  test('rejects when the request carries no bearer token', async () => {
    await expect(strategy.validate(requestWith(undefined), payload)).rejects.toThrow(UnauthorizedException)

    expect(tokenRevocation.assertTokenActive).not.toHaveBeenCalled()
    expect(authService.validateTokenPayload).not.toHaveBeenCalled()
  })
})
