import { OpenId4VcIssuanceSessionState } from '@credo-ts/openid4vc'
import { createMock } from '@golevelup/ts-vitest'

import { TenantAgent } from 'common/agent'
import { Logger } from 'common/logger'

import { GetIssuanceSessionByQueryDto } from '../dto'
import { OpenId4VcIssuanceSessionController } from '../issuance-session.controller'
import { OpenId4VcIssuanceSessionService } from '../issuance-session.service'

describe('OpenId4VcIssuanceSessionController', () => {
  test('getIssuanceSessionsByQuery does not log the pre-authorized code, offer URI or c_nonce', async () => {
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

    const getIssuanceSessionsByQuery = vi.fn().mockResolvedValue([])
    const issuanceService = { getIssuanceSessionsByQuery } as unknown as OpenId4VcIssuanceSessionService
    const controller = new OpenId4VcIssuanceSessionController(issuanceService, recordingLogger as unknown as Logger)

    const query: GetIssuanceSessionByQueryDto = {
      preAuthorizedCode: 'PRE-CODE-SECRET',
      credentialOfferUri: 'OFFER-URI-SECRET',
      cNonce: 'C-NONCE-SECRET',
      publicIssuerId: 'pub1',
      state: OpenId4VcIssuanceSessionState.OfferCreated,
    }
    const tenantAgent = createMock<TenantAgent>()

    await controller.getIssuanceSessionsByQuery(tenantAgent, query)

    expect(getIssuanceSessionsByQuery).toHaveBeenCalledWith(tenantAgent, query)
    const logged = JSON.stringify(calls)
    for (const secret of ['PRE-CODE-SECRET', 'OFFER-URI-SECRET', 'C-NONCE-SECRET']) {
      expect(logged).not.toContain(secret)
    }
    expect(child).toHaveBeenCalledWith('getIssuanceSessionsByQuery', {
      publicIssuerId: 'pub1',
      state: OpenId4VcIssuanceSessionState.OfferCreated,
    })
  })
})
