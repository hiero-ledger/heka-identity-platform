import { PasskeyAuthResult, PasskeysStore } from '../../src/stores/PasskeysStore'
import { waitFor } from '@testing-library/react-native'
import { mockFunction } from '../../../jest-helpers/helpers'
import axios from 'axios'
import { Passkey } from 'react-native-passkey'

const mockAuthProviderUrl = 'https://mock-auth-provider-url'
const mockAuthApiUrl = `${mockAuthProviderUrl}/webauthn`

const mockUserName = 'mock-user-name'

const mockAuthRequest = {
  challenge: 'mock-challenge',
  timeout: 1800000,
  userVerification: 'required',
  rpId: 'mock-rp-id',
  extensions: {
    prf: {
      eval: {
        first: 'Rcb6KYJ01kuYC9IpXnUhAVRjr2vra0kgXUhxrev6Z8I',
      },
    },
  },
}

const mockOrigin = new URL(mockAuthApiUrl).origin

const mockRegistrationRequest = {
  challenge: 'mock-challenge',
  rp: {
    id: 'mock-rp-id',
    name: 'mock-rp-name',
  },
  pubKeyCredParams: [
    {
      type: 'public-key',
      alg: -7,
    },
    {
      type: 'public-key',
      alg: -257,
    },
  ],
  authenticatorSelection: {
    authenticatorAttachment: 'platform',
    residentKey: 'required',
    userVerification: 'required',
  },
  user: {
    id: 'mock-user-id',
    name: mockUserName,
    displayName: mockUserName,
    origin: mockOrigin,
  },
  extensions: {
    prf: {
      eval: {
        first: 'Rcb6KYJ01kuYC9IpXnUhAVRjr2vra0kgXUhxrev6Z8I',
      },
    },
  },
}

const mockAuthResult = {
  challenge: 'mock-challenge',
  rawId: 'mock-raw-id',
  authenticatorAttachment: 'platform',
  type: 'public-key',
  id: 'mock-id',
  response: {
    clientDataJSON: 'mock-client-data',
    attestationObject: 'mock-authenticator-data',
    signature: 'mock-signature',
    userHandle: 'mock-user-handle',
  },
  clientExtensionResults: {
    prf: {
      results: {
        first: 'mock-prf-hmac',
      },
    },
  },
}

jest.mock('react-native-passkey', () => ({
  Passkey: {
    register: jest.fn(() => Promise.resolve(mockAuthResult)),
    authenticate: jest.fn(() => Promise.resolve(mockAuthResult)),
    isSupported: jest.fn(() => Promise.resolve(true)),
  },
}))

// Just in case - it may look like we can just put this in 'beforeEach' callback, but we don't want to do that
// PasskeysStore is a MobX store with async initialization (and it potentially will run other reactive side effects)
// In this case, we want to be able to update mocks before init that will be called in constructor
async function createAndInitializeStore(): Promise<PasskeysStore> {
  const passkeysStore = new PasskeysStore(mockAuthProviderUrl)
  await waitFor(() => expect(passkeysStore.isLoading).toBe(false))
  return passkeysStore
}

describe('PasskeysStore', () => {
  beforeEach(() => {
    mockFunction(axios.post).mockImplementation((url) => {
      switch (url) {
        case `${mockAuthApiUrl}/registration/challenge`:
          return Promise.resolve({ data: mockRegistrationRequest })
        case `${mockAuthApiUrl}/registration`:
          return Promise.resolve({ data: { verified: true } })
        case `${mockAuthApiUrl}/authentication/challenge`:
          return Promise.resolve({ data: mockAuthRequest })
        case `${mockAuthApiUrl}/authentication`:
          return Promise.resolve({ data: { verified: true } })
        default:
          return Promise.resolve()
      }
    })
  })

  afterAll(() => {
    mockFunction(axios.post).mockReset()
  })

  // Skipped for now as PasskeysStore does not have async initialization logic for now
  it.skip('should provide loading state', async () => {
    const passkeysStore = new PasskeysStore(mockAuthProviderUrl)
    expect(passkeysStore.isLoading).toBe(true)
    await waitFor(() => expect(passkeysStore.isLoading).toBe(false))
  })

  it('should initialize with non-authenticated state', async () => {
    const passkeysStore = await createAndInitializeStore()

    expect(passkeysStore.isAuthenticated).toBe(false)
  })

  it('should register new passkey', async () => {
    const passkeysStore = await createAndInitializeStore()

    expect(passkeysStore.isAuthenticated).toBe(false)

    await passkeysStore.register(mockUserName)

    expect(passkeysStore.isAuthenticated).toBe(true)

    expect(Passkey.register).toHaveBeenCalledTimes(1)
    expect(Passkey.register).toHaveBeenCalledWith(mockRegistrationRequest)

    expect(axios.post).toHaveBeenCalledTimes(2)
    expect(axios.post).toHaveBeenCalledWith(`${mockAuthApiUrl}/registration/challenge`, {
      name: mockUserName,
      displayName: mockUserName,
      origin: mockOrigin,
    })
    expect(axios.post).toHaveBeenCalledWith(`${mockAuthApiUrl}/registration`, mockAuthResult)
  })

  it('should throw error if new passkey registration is not verified by provider', async () => {
    mockFunction(axios.post)
      .mockResolvedValueOnce({ data: mockRegistrationRequest })
      .mockRejectedValue(new Error('Failed'))

    const passkeysStore = await createAndInitializeStore()

    expect(passkeysStore.isAuthenticated).toBe(false)

    await expect(passkeysStore.register(mockUserName)).rejects.toThrow()

    expect(passkeysStore.isAuthenticated).toBe(false)

    expect(axios.post).toHaveBeenCalledTimes(2)
    expect(axios.post).toHaveBeenCalledWith(`${mockAuthApiUrl}/registration`, mockAuthResult)
  })

  it('should authenticate with existing passkey', async () => {
    const passkeysStore = await createAndInitializeStore()

    expect(passkeysStore.isAuthenticated).toBe(false)

    await passkeysStore.authenticate(mockUserName)

    expect(passkeysStore.isAuthenticated).toBe(true)

    expect(Passkey.authenticate).toHaveBeenCalledTimes(1)
    expect(Passkey.authenticate).toHaveBeenCalledWith(mockAuthRequest)

    expect(axios.post).toHaveBeenCalledTimes(2)
    expect(axios.post).toHaveBeenCalledWith(`${mockAuthApiUrl}/authentication/challenge`, {
      name: mockUserName,
      origin: mockOrigin,
    })
    expect(axios.post).toHaveBeenCalledWith(`${mockAuthApiUrl}/authentication`, mockAuthResult)
  })

  it('should throw error if authentication is not verified by provider', async () => {
    mockFunction(axios.post)
      .mockResolvedValueOnce({ data: mockRegistrationRequest })
      .mockRejectedValue(new Error('Failed'))

    const passkeysStore = await createAndInitializeStore()

    expect(passkeysStore.isAuthenticated).toBe(false)

    await expect(passkeysStore.authenticate(mockUserName)).rejects.toThrow()

    expect(passkeysStore.isAuthenticated).toBe(false)

    expect(axios.post).toHaveBeenCalledTimes(2)
    expect(axios.post).toHaveBeenCalledWith(`${mockAuthApiUrl}/authentication`, mockAuthResult)
  })

  it('should provide HMAC from PRF extension', async () => {
    const passkeysStore = await createAndInitializeStore()

    await passkeysStore.authenticate(mockUserName)

    expect(passkeysStore.isAuthenticated).toBe(true)

    // TODO: Use processed PRF value
    // expect(passkeysStore.HMAC).toBe(mockAuthResult.clientExtensionResults.prf.results.first)
    expect(passkeysStore.HMAC).toBe(mockAuthRequest.extensions.prf.eval.first)
  })

  it('should throw error on attempt to get HMAC if not authenticated', async () => {
    const passkeysStore = await createAndInitializeStore()

    expect(passkeysStore.isAuthenticated).toBe(false)

    expect(() => passkeysStore.HMAC).toThrow()
  })

  it('should throw error on attempt to get HMAC if PRF extension result is empty', async () => {
    mockFunction(axios.post)
      .mockResolvedValueOnce({
        data: {
          ...mockRegistrationRequest,
          extensions: {},
        },
      })
      .mockResolvedValueOnce({ data: { verified: false } })

    // Type cast is needed to apply right promise return type
    mockFunction(Passkey.authenticate as () => Promise<PasskeyAuthResult>).mockResolvedValueOnce({
      ...mockAuthResult,
      clientExtensionResults: {},
    })

    const passkeysStore = await createAndInitializeStore()

    await passkeysStore.authenticate(mockUserName)

    expect(passkeysStore.isAuthenticated).toBe(true)

    expect(() => passkeysStore.HMAC).toThrow()
  })

  it('should provide supported state', async () => {
    const passkeysStore = await createAndInitializeStore()

    expect(passkeysStore.isSupported)

    expect(Passkey.isSupported).toHaveBeenCalledTimes(1)
  })
})
