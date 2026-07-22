import { type ExecutionContext, UnauthorizedException } from '@nestjs/common'

import type { TokenRepository, UserRepository } from '../../src/core/database/repositories'
import { UserAuthGuard } from '../../src/oauth/guards/user.guard'

function createContext(headers: Record<string, string | undefined>): {
  context: ExecutionContext
  request: Record<string, unknown>
} {
  const request: Record<string, unknown> = { headers }
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext

  return { context, request }
}

function createGuard() {
  const userRepository = { findOneOrFail: vi.fn() } satisfies Partial<UserRepository>
  const tokenRepository = { get: vi.fn() } satisfies Partial<TokenRepository>

  const guard = new UserAuthGuard(
    userRepository as unknown as UserRepository,
    tokenRepository as unknown as TokenRepository,
  )

  return { guard, userRepository, tokenRepository }
}

describe('UserAuthGuard', () => {
  it('should expose the access token and sender on the request, then allow the call', async () => {
    const { guard, userRepository, tokenRepository } = createGuard()
    const user = { id: 'user-1' }
    tokenRepository.get.mockResolvedValue({ subject: 'user-1', token: 'access-token' })
    userRepository.findOneOrFail.mockResolvedValue(user)

    const { context, request } = createContext({ authorization: 'Bearer access-token' })

    await expect(guard.canActivate(context)).resolves.toBe(true)

    // the fix under test: the caller's access token is exposed for @AccessToken() on the revoke route
    expect(request.accessToken).toBe('access-token')
    expect(request.sender).toBe(user)
    expect(tokenRepository.get).toHaveBeenCalledWith('access-token')
    expect(userRepository.findOneOrFail).toHaveBeenCalledWith({ id: 'user-1' })
  })

  it('should throw UnauthorizedException when the Authorization header is missing', async () => {
    const { guard, tokenRepository } = createGuard()
    const { context } = createContext({})

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException)
    expect(tokenRepository.get).not.toHaveBeenCalled()
  })

  it('should throw UnauthorizedException when the access token is not stored', async () => {
    const { guard, userRepository, tokenRepository } = createGuard()
    tokenRepository.get.mockResolvedValue(null)

    const { context } = createContext({ authorization: 'Bearer unknown-token' })

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException)
    expect(userRepository.findOneOrFail).not.toHaveBeenCalled()
  })

  it('should throw UnauthorizedException when the token subject has no user', async () => {
    const { guard, userRepository, tokenRepository } = createGuard()
    tokenRepository.get.mockResolvedValue({ subject: 'ghost', token: 'access-token' })
    userRepository.findOneOrFail.mockRejectedValue(new Error('not found'))

    const { context } = createContext({ authorization: 'Bearer access-token' })

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException)
  })
})
