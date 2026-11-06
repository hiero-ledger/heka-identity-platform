import { CredoError, RecordNotFoundError } from '@credo-ts/core'
import { createMock } from '@golevelup/ts-vitest'
import { CallHandler, ExecutionContext, InternalServerErrorException, NotFoundException } from '@nestjs/common'
import { firstValueFrom, throwError } from 'rxjs'

import { Logger } from 'common/logger'

import { ExceptionMapperInterceptor } from '../exception-mapper.interceptor'

describe('ExceptionMapperInterceptor', () => {
  const intercepted = (error: Error) =>
    firstValueFrom(
      new ExceptionMapperInterceptor(createMock<Logger>()).intercept(createMock<ExecutionContext>(), {
        handle: () => throwError(() => error),
      } as CallHandler),
    )

  test('a missing record is 404', async () => {
    const error = new RecordNotFoundError('OpenId4VcIssuerRecord: No record found', {
      recordType: 'OpenId4VcIssuerRecord',
    })

    await expect(intercepted(error)).rejects.toThrow(new NotFoundException(error.message))
  })

  test('any other Credo error is 500', async () => {
    await expect(intercepted(new CredoError('boom'))).rejects.toThrow(InternalServerErrorException)
  })

  test('other errors pass through', async () => {
    const error = new Error('other')

    await expect(intercepted(error)).rejects.toBe(error)
  })
})
