import { CredoError, LogLevel } from '@credo-ts/core'
import { createMock } from '@golevelup/ts-vitest'

import { Logger } from 'common/logger'

import { CredoLogger, serializeLogData } from '../credo-logger'

describe('CredoLogger', () => {
  test('logs the message, stack and cause of an error passed in data instead of {}', () => {
    const logError = vi.fn()
    const credoLogger = new CredoLogger(createMock<Logger>({ error: logError }), LogLevel.Trace)
    const cause = new Error('ledger read timed out')
    const error = new CredoError('Could not retrieve revocation status list', { cause })

    credoLogger.error('Failed to process message', { error })

    // pino writes JSON: a raw Error serializes to {}, which is how the reason got lost
    const logged = JSON.parse(JSON.stringify(logError.mock.calls[0][0])) as {
      msg: string
      data: { error: Record<string, unknown> }
    }
    expect(logged.msg).toBe('Failed to process message')
    expect(logged.data.error).toMatchObject({
      name: 'CredoError',
      message: 'Could not retrieve revocation status list',
      cause: { name: 'Error', message: 'ledger read timed out' },
    })
    expect(logged.data.error.stack).toContain('Could not retrieve revocation status list')
  })

  test('stops at an error that is its own cause', () => {
    const error = new Error('self-referencing')
    error.cause = error

    expect(serializeLogData({ error })).toMatchObject({
      error: { message: 'self-referencing', cause: '[Circular cause]' },
    })
  })

  test('stops at a cause that repeats across errors', () => {
    const first = new Error('first')
    const second = new Error('second', { cause: first })
    first.cause = second

    expect(serializeLogData({ error: first })).toMatchObject({
      error: { message: 'first', cause: { message: 'second', cause: '[Circular cause]' } },
    })
  })

  test('passes other data through unchanged', () => {
    const data = { revocationRegistryDefinitionId: 'did:indy:test/rev', attempt: 2, nested: { a: 1 } }

    expect(serializeLogData(data)).toEqual(data)
    expect(serializeLogData(undefined)).toBeUndefined()
  })
})
