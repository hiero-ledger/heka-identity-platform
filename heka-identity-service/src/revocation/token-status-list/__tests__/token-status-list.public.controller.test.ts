import type { Response } from 'express'

import { createMock } from '@golevelup/ts-vitest'
import { INestApplication, Logger as NestLogger, NotAcceptableException, NotFoundException } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'

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

    await expect(controller.get('list-1', createMock<Response>(), 'application/statuslist+jwt')).resolves.toBe('h.p.s')
    await expect(controller.get('list-1', createMock<Response>(), 'application/statuslist+cwt')).rejects.toBeInstanceOf(
      NotAcceptableException,
    )
    expect(service.getToken).toHaveBeenCalledTimes(1)
  })

  describe('over HTTP', () => {
    const TOKEN = 'eyJ0eXAiOiJzdGF0dXNsaXN0K2p3dCJ9.eyJzdGF0dXNfbGlzdCI6e319.c2ln'
    let app: INestApplication
    let service: TokenStatusListService
    let warn: ReturnType<typeof vi.spyOn>

    beforeAll(async () => {
      service = createMock<TokenStatusListService>()
      const moduleRef = await Test.createTestingModule({
        controllers: [TokenStatusListPublicController],
        providers: [
          { provide: TokenStatusListService, useValue: service },
          { provide: 'TokenStatusListPublicControllerLogger', useValue: createMock<Logger>() },
        ],
      }).compile()
      app = moduleRef.createNestApplication({ logger: false })
      await app.init()
    })

    afterAll(async () => {
      await app.close()
    })

    beforeEach(() => {
      vi.mocked(service.getToken).mockReset()
      // Nest's ExpressAdapter warns through its own Logger when an error body meets a non-JSON Content-Type
      warn = vi.spyOn(NestLogger.prototype, 'warn')
    })

    afterEach(() => {
      warn.mockRestore()
    })

    test('the token is a statuslist+jwt, cacheable for its ttl and varying on Accept', async () => {
      vi.mocked(service.getToken).mockResolvedValue(TOKEN)

      const response = await request(app.getHttpServer()).get('/token-status-lists/list-1').expect(200)

      expect(response.text).toBe(TOKEN)
      expect(response.headers['content-type']).toBe('application/statuslist+jwt; charset=utf-8')
      expect(response.headers['cache-control']).toBe('max-age=300')
      expect(response.headers.vary).toBe('Accept')
      expect(service.getToken).toHaveBeenCalledWith('list-1')
    })

    test('404 is plain JSON with a static message, not cached, and logs no warning', async () => {
      vi.mocked(service.getToken).mockRejectedValue(new NotFoundException('Token status list not found'))

      const response = await request(app.getHttpServer()).get('/token-status-lists/%3Cscript%3E').expect(404)

      expect(response.headers['content-type']).toMatch(/^application\/json/)
      expect(response.headers).not.toHaveProperty('cache-control')
      expect(response.body).toEqual({ statusCode: 404, message: 'Token status list not found', error: 'Not Found' })
      expect(response.text).not.toContain('script')
      expect(warn).not.toHaveBeenCalled()
    })

    test('406 is plain JSON, not cached, varies on Accept and logs no warning', async () => {
      const response = await request(app.getHttpServer())
        .get('/token-status-lists/list-1')
        .set('Accept', 'application/statuslist+cwt')
        .expect(406)

      expect(response.headers['content-type']).toMatch(/^application\/json/)
      expect(response.headers).not.toHaveProperty('cache-control')
      expect(response.headers.vary).toBe('Accept')
      expect(service.getToken).not.toHaveBeenCalled()
      expect(warn).not.toHaveBeenCalled()
    })
  })
})
