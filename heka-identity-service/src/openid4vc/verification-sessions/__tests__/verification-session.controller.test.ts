import { OpenId4VcVerificationSessionState } from '@credo-ts/openid4vc'
import { createMock } from '@golevelup/ts-vitest'

import { TenantAgent } from 'common/agent'
import { Logger } from 'common/logger'

import { GetVerificationSessionByQueryDto } from '../dto'
import { OpenId4VcVerificationSessionController } from '../verification-session.controller'
import { OpenId4VcVerificationSessionService } from '../verification-session.service'

describe('OpenId4VcVerificationSessionController', () => {
  test('getVerificationSessionsByQuery does not log the nonce, authorization request URI or payload state', async () => {
    const calls: Array<{ method: string; args: unknown[] }> = []
    const recordingLogger: Record<string, unknown> = {}
    for (const method of ['trace', 'traceObject', 'debug', 'info', 'warn', 'error', 'fatal']) {
      recordingLogger[method] = (...args: unknown[]) => calls.push({ method, args })
    }
    const child = vi.fn((context: string, bindings?: object) => {
      calls.push({ method: 'child', args: [context, bindings] })
      return recordingLogger
    })
    recordingLogger.child = child

    const getVerificationSessionsByQuery = vi.fn().mockResolvedValue([])
    const verificationService = { getVerificationSessionsByQuery } as unknown as OpenId4VcVerificationSessionService
    const controller = new OpenId4VcVerificationSessionController(
      verificationService,
      recordingLogger as unknown as Logger,
    )

    const query: GetVerificationSessionByQueryDto = {
      nonce: 'NONCE-SECRET',
      authorizationRequestUri: 'AUTH-REQUEST-URI-SECRET',
      payloadState: 'PAYLOAD-STATE-SECRET',
      publicVerifierId: 'verifier1',
      state: OpenId4VcVerificationSessionState.RequestCreated,
    }
    const tenantAgent = createMock<TenantAgent>()

    await controller.getVerificationSessionsByQuery(tenantAgent, query)

    expect(getVerificationSessionsByQuery).toHaveBeenCalledWith(tenantAgent, query)
    const logged = JSON.stringify(calls)
    for (const secret of ['NONCE-SECRET', 'AUTH-REQUEST-URI-SECRET', 'PAYLOAD-STATE-SECRET']) {
      expect(logged).not.toContain(secret)
    }
    expect(child).toHaveBeenCalledWith('getVerificationSessionsByQuery', {
      publicVerifierId: 'verifier1',
      state: OpenId4VcVerificationSessionState.RequestCreated,
    })
  })
})
