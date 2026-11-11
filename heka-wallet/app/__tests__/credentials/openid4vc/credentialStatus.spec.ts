import { createHeaderAndPayload, StatusList } from '@owf/token-status-list'
import { SDJwtVcInstance } from '@sd-jwt/sd-jwt-vc'

import {
  CredentialStatus,
  findRevokedCredentialIds,
  getSdJwtVcStatus,
  isInvalidStatusError,
  STATUS_CHECK_TIMEOUT_MS,
} from '../../../src/credentials/openid4vc/credentialStatus'
import { HekaWalletAgent } from '../../../src/utils/agent'

jest.mock('../../../src/utils/agent', () => ({}))

const STATUS_LIST_URI = 'https://issuer.example/status-lists/1'

type StatusCheckingInstance = {
  verifyStatus: (result: { payload: Record<string, unknown> }, options: Record<string, unknown>) => Promise<void>
}

function base64UrlJson(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString('base64url')
}

// A status list token as an issuer publishes it: entry 0 is VALID, entry 1 is INVALID (revoked).
function statusListJwt() {
  const { header, payload } = createHeaderAndPayload(
    new StatusList([0, 1], 1),
    { iss: 'did:key:issuer', sub: STATUS_LIST_URI, iat: Math.floor(Date.now() / 1000) },
    { alg: 'ES256', typ: 'statuslist+jwt' }
  )
  return `${base64UrlJson(header)}.${base64UrlJson(payload)}.signature`
}

/**
 * Runs @sd-jwt/sd-jwt-vc's own status check (the step Credo's `sdJwtVc.verify` runs) and returns the error it
 * throws, so the tests use the library's real error instead of a hard-coded copy of its message.
 */
async function sdJwtLibraryStatusError(idx: number, statusListFetcher: (uri: string) => Promise<string>) {
  const instance = new SDJwtVcInstance({
    statusListFetcher,
    // The status list signature is not under test here; Credo checks it with the issuer key.
    statusVerifier: async () => true,
  }) as unknown as StatusCheckingInstance

  return instance.verifyStatus({ payload: { status: { status_list: { uri: STATUS_LIST_URI, idx } } } }, {}).then(
    () => undefined,
    (error: unknown) => error
  )
}

function sdJwtVcRecord(id: string) {
  return {
    id,
    type: 'SdJwtVcRecord',
    firstCredential: {
      compact: `${id}-compact~disclosure~`,
      payload: { vct: 'urn:example:employee', status: { status_list: { uri: STATUS_LIST_URI, idx: 1 } } },
    },
  }
}

function createAgent() {
  return {
    sdJwtVc: { verify: jest.fn() },
    config: { logger: { warn: jest.fn() } },
  }
}

describe('isInvalidStatusError', () => {
  it('recognises the error @sd-jwt/sd-jwt-vc throws for a revoked status list entry', async () => {
    const error = await sdJwtLibraryStatusError(1, async () => statusListJwt())

    expect(error).toBeInstanceOf(Error)
    expect(isInvalidStatusError(error)).toBe(true)
  })

  it('does not see a valid status list entry as an error', async () => {
    expect(await sdJwtLibraryStatusError(0, async () => statusListJwt())).toBeUndefined()
  })

  it('does not match a status list fetch failure whose response body says "Status is not valid"', async () => {
    // Credo's status list fetcher puts the server's response body into its error message.
    const error = await sdJwtLibraryStatusError(1, async (uri) => {
      throw new Error(
        `Received invalid response with status 404 when fetching status list from ${uri}. Not found: Status is not valid`
      )
    })

    expect(error).toBeInstanceOf(Error)
    expect(isInvalidStatusError(error)).toBe(false)
  })

  it.each([
    ['a plain Error with the same message', new Error('Status is not valid')],
    [
      'an SDJWTException with a longer message',
      Object.assign(new Error('Status is not valid: 404'), { name: 'SDJWTException' }),
    ],
    ['a non-error value', 'Status is not valid'],
    ['undefined', undefined],
  ])('does not match %s', (_, error) => {
    expect(isInvalidStatusError(error)).toBe(false)
  })
})

describe('getSdJwtVcStatus', () => {
  it('reports revoked for the error Credo returns for a revoked entry', async () => {
    const agent = createAgent()
    const error = await sdJwtLibraryStatusError(1, async () => statusListJwt())
    agent.sdJwtVc.verify.mockResolvedValue({ isValid: false, error })

    await expect(
      getSdJwtVcStatus(agent as unknown as HekaWalletAgent, sdJwtVcRecord('revoked') as never)
    ).resolves.toBe(CredentialStatus.Revoked)
  })

  it('reports unknown when the status list server answers 404 with "Status is not valid" in the body', async () => {
    const agent = createAgent()
    const error = await sdJwtLibraryStatusError(1, async (uri) => {
      throw new Error(
        `Received invalid response with status 404 when fetching status list from ${uri}. Not found: Status is not valid`
      )
    })
    agent.sdJwtVc.verify.mockResolvedValue({ isValid: false, error })

    await expect(getSdJwtVcStatus(agent as unknown as HekaWalletAgent, sdJwtVcRecord('404') as never)).resolves.toBe(
      CredentialStatus.Unknown
    )
    expect(agent.config.logger.warn).toHaveBeenCalledWith('Could not verify the status of an SD-JWT VC', {
      credentialRecordId: '404',
      error: expect.stringContaining('status 404'),
    })
  })
})

describe('findRevokedCredentialIds', () => {
  afterEach(() => {
    jest.useRealTimers()
  })

  it('gives up after the timeout and reports no revoked credential when the check hangs', async () => {
    jest.useFakeTimers()
    const agent = createAgent()
    agent.sdJwtVc.verify.mockReturnValue(new Promise(() => undefined))

    let revokedIds: string[] | undefined
    const check = findRevokedCredentialIds(agent as unknown as HekaWalletAgent, [
      sdJwtVcRecord('hanging') as never,
    ]).then((ids) => {
      revokedIds = ids
    })

    await jest.advanceTimersByTimeAsync(STATUS_CHECK_TIMEOUT_MS - 1)
    expect(revokedIds).toBeUndefined()

    await jest.advanceTimersByTimeAsync(1)
    await check
    expect(revokedIds).toEqual([])
    expect(agent.config.logger.warn).toHaveBeenCalledWith('Timed out checking the status of SD-JWT VCs', {
      timeoutMs: STATUS_CHECK_TIMEOUT_MS,
      credentialCount: 1,
    })
    expect(jest.getTimerCount()).toBe(0)
  })

  it('clears the timer when the check finishes in time', async () => {
    jest.useFakeTimers()
    const agent = createAgent()
    const error = await sdJwtLibraryStatusError(1, async () => statusListJwt())
    agent.sdJwtVc.verify.mockResolvedValue({ isValid: false, error })

    await expect(
      findRevokedCredentialIds(agent as unknown as HekaWalletAgent, [sdJwtVcRecord('revoked') as never])
    ).resolves.toEqual(['revoked'])
    expect(jest.getTimerCount()).toBe(0)
    expect(agent.config.logger.warn).not.toHaveBeenCalled()
  })

  it('does not start a timer when no SD-JWT VC was presented', async () => {
    jest.useFakeTimers()
    const agent = createAgent()

    await expect(
      findRevokedCredentialIds(agent as unknown as HekaWalletAgent, [{ id: 'mdoc', type: 'MdocRecord' } as never])
    ).resolves.toEqual([])
    expect(jest.getTimerCount()).toBe(0)
    expect(agent.sdJwtVc.verify).not.toHaveBeenCalled()
  })
})
