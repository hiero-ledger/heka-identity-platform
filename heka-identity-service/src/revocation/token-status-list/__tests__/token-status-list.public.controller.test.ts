import { createMock } from '@golevelup/ts-vitest'
import { NotAcceptableException } from '@nestjs/common'

import { Logger } from 'common/logger'

import { acceptsStatusListJwt, TokenStatusListPublicController } from '../token-status-list.public.controller'
import { TokenStatusListService } from '../token-status-list.service'

describe('TokenStatusListPublicController', () => {
  test.each([
    [undefined, true],
    ['', true],
    ['*/*', true],
    ['application/*', true],
    ['application/statuslist+jwt', true],
    ['application/statuslist+cwt, application/statuslist+jwt;q=0.5', true],
    ['application/statuslist+cwt', false],
    ['text/html', false],
  ])('acceptsStatusListJwt(%j) → %s', (accept, expected) => {
    expect(acceptsStatusListJwt(accept)).toBe(expected)
  })

  test('serves the stored token and answers 406 to a CWT-only Accept', async () => {
    const service = createMock<TokenStatusListService>({ getToken: vi.fn().mockResolvedValue('h.p.s') })
    const controller = new TokenStatusListPublicController(service, createMock<Logger>())

    await expect(controller.get('list-1', 'application/statuslist+jwt')).resolves.toBe('h.p.s')
    await expect(controller.get('list-1', 'application/statuslist+cwt')).rejects.toBeInstanceOf(NotAcceptableException)
    expect(service.getToken).toHaveBeenCalledTimes(1)
  })
})
