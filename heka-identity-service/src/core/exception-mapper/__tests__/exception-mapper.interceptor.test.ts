import { CredoError, RecordNotFoundError } from '@credo-ts/core'
import { createMock } from '@golevelup/ts-vitest'
import { CallHandler, ExecutionContext, InternalServerErrorException, NotFoundException } from '@nestjs/common'
import { firstValueFrom, throwError } from 'rxjs'

import { Logger } from 'common/logger'

import { ExceptionMapperInterceptor } from '../exception-mapper.interceptor'

describe('ExceptionMapperInterceptor', () => {
  let childLogger: Logger

  const intercepted = (error: Error) => {
    childLogger = createMock<Logger>()
    const logger = createMock<Logger>({ child: () => childLogger })
    const context = createMock<ExecutionContext>({
      switchToHttp: () => ({
        getRequest: () => ({ method: 'POST', route: { path: '/openid4vc/issuance-session/offer' } }),
      }),
    })
    return firstValueFrom(
      new ExceptionMapperInterceptor(logger).intercept(context, {
        handle: () => throwError(() => error),
      } as CallHandler),
    )
  }

  test('a missing record is 404 naming only its type, logged as a warning with the route', async () => {
    // Credo prefixes the message with the record type
    const error = new RecordNotFoundError('No record found for given query \'{"issuerId":"x"}\'', {
      recordType: 'OpenId4VcIssuerRecord',
    })

    await expect(intercepted(error)).rejects.toThrow(new NotFoundException('OpenId4VcIssuerRecord not found'))
    expect(childLogger.warn).toHaveBeenCalledWith(
      'OpenId4VcIssuerRecord not found: POST /openid4vc/issuance-session/offer',
    )
  })

  test("a missing tenant is not the client's error: 500, logged as an error", async () => {
    const error = new RecordNotFoundError('record with id tenant-1 not found.', { recordType: 'TenantRecord' })

    await expect(intercepted(error)).rejects.toThrow(InternalServerErrorException)
    expect(childLogger.error).toHaveBeenCalledWith(error)
  })

  test('any other Credo error is 500', async () => {
    await expect(intercepted(new CredoError('boom'))).rejects.toThrow(InternalServerErrorException)
  })

  test('other errors pass through', async () => {
    const error = new Error('other')

    await expect(intercepted(error)).rejects.toBe(error)
  })
})
