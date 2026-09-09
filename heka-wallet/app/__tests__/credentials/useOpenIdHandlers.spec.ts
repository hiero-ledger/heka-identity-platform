import { OpenId4VciResolvedCredentialOffer } from '@credo-ts/openid4vc'
import { getHostNameFromUrl } from '@heka-wallet/shared'
import { renderHook } from '@testing-library/react-native'

import { mockFunction } from '../../../jest-helpers/helpers'
import { useOpenIdHandlers } from '../../src/credentials/useOpenIdHandlers'

import { hekaIdentityServiceSdJwtVc } from './fixtures'
import { Kms } from '@credo-ts/core'

const mockPublicDid = 'did:key:mock-key-fingerprint'
const mockUserPin = 'mock-user-pin'

const mockAgent = {
  openid4vc: {
    holder: {
      resolveCredentialOffer: jest.fn(),
      resolveOpenId4VciAuthorizationRequest: jest.fn(),
      resolveOpenId4VpAuthorizationRequest: jest.fn(),
      acceptOpenId4VpAuthorizationRequest: jest.fn(),
      requestToken: jest.fn(),
      requestCredentials: jest.fn(),
      selectCredentialsForDcqlRequest: jest.fn(),
    },
  },
  kms: {
    createKeyForSignatureAlgorithm: jest.fn(),
  },
  dids: {
    create: jest.fn(),
  },
  config: {
    logger: {
      info: jest.fn(),
    },
  },
}

// useHekaAgent lives in utils/agent.ts, which eagerly imports native/ESM Credo modules.
// Mock the module so the heavy graph is never loaded in the test environment.
jest.mock('../../src/utils/agent', () => ({
  useHekaAgent: jest.fn(() => ({ loading: false, agent: mockAgent, publicDid: mockPublicDid })),
}))

function renderOpenIdHandlersHookValue() {
  const { result } = renderHook(() => useOpenIdHandlers())
  return result.current
}

describe('useOpenIdHandlers', () => {
  const fixture = hekaIdentityServiceSdJwtVc

  const unsupportedOfferedCredential = {
    id: 'unsupported-first-id',
    format: 'jwt_vc' as const,
    vct: 'empl:unsupported',
  } as unknown as OpenId4VciResolvedCredentialOffer['offeredCredentialConfigurations'][number]

  const mixedFormatResolvedCredentialOffer: OpenId4VciResolvedCredentialOffer = {
    ...fixture.resolvedCredentialOfferPreAuth,
    offeredCredentialConfigurations: {
      unsupportedOfferedCredential,
      ...fixture.resolvedCredentialOfferPreAuth.offeredCredentialConfigurations,
    },
  }

  describe('resolveOpenId4VciOffer', () => {
    it('should resolve OID4VCI offer (pre-auth)', async () => {
      mockFunction(mockAgent.openid4vc.holder.resolveCredentialOffer).mockResolvedValueOnce(
        fixture.resolvedCredentialOfferPreAuth
      )

      const { resolveOpenId4VciOffer } = renderOpenIdHandlersHookValue()
      const { resolvedCredentialOffer, resolvedAuthorizationRequest } = await resolveOpenId4VciOffer({
        offer: { uri: fixture.credentialOfferUrl },
      })

      expect(resolvedCredentialOffer).toBe(fixture.resolvedCredentialOfferPreAuth)
      expect(resolvedAuthorizationRequest).toBeUndefined()

      expect(mockAgent.openid4vc.holder.resolveCredentialOffer).toHaveBeenCalledWith(fixture.credentialOfferUrl)
      expect(mockAgent.openid4vc.holder.resolveCredentialOffer).toHaveBeenCalledTimes(1)

      expect(mockAgent.openid4vc.holder.resolveOpenId4VciAuthorizationRequest).toHaveBeenCalledTimes(0)
    })

    it('should resolve OID4VCI offer (authorization code)', async () => {
      mockFunction(mockAgent.openid4vc.holder.resolveCredentialOffer).mockResolvedValueOnce(
        fixture.resolvedCredentialOfferAuthorizationCode
      )
      mockFunction(mockAgent.openid4vc.holder.resolveOpenId4VciAuthorizationRequest).mockResolvedValueOnce(
        fixture.resolvedIssuanceAuthorizationRequest
      )

      const { resolveOpenId4VciOffer } = renderOpenIdHandlersHookValue()
      const { resolvedCredentialOffer, resolvedAuthorizationRequest } = await resolveOpenId4VciOffer({
        offer: { uri: fixture.credentialOfferUrl },
        authorization: fixture.authorizationParams,
      })

      expect(resolvedCredentialOffer).toBe(fixture.resolvedCredentialOfferAuthorizationCode)
      expect(resolvedAuthorizationRequest).toBe(fixture.resolvedIssuanceAuthorizationRequest)

      expect(mockAgent.openid4vc.holder.resolveCredentialOffer).toHaveBeenCalledWith(fixture.credentialOfferUrl)
      expect(mockAgent.openid4vc.holder.resolveCredentialOffer).toHaveBeenCalledTimes(1)

      expect(mockAgent.openid4vc.holder.resolveOpenId4VciAuthorizationRequest).toHaveBeenCalledWith(
        resolvedCredentialOffer,
        {
          redirectUri: fixture.authorizationParams.redirectUri,
          clientId: fixture.authorizationParams.clientId,
        }
      )
      expect(mockAgent.openid4vc.holder.resolveOpenId4VciAuthorizationRequest).toHaveBeenCalledTimes(1)
    })

    it('should throw if no authorization params provided for authorization code flow', async () => {
      mockFunction(mockAgent.openid4vc.holder.resolveCredentialOffer).mockResolvedValueOnce(
        () => fixture.resolvedCredentialOfferAuthorizationCode
      )

      const { resolveOpenId4VciOffer } = renderOpenIdHandlersHookValue()
      await expect(resolveOpenId4VciOffer({ offer: { uri: fixture.credentialOfferUrl } })).rejects.toThrow()
    })

    it('should throw if parsed offer is empty', async () => {
      const { resolveOpenId4VciOffer } = renderOpenIdHandlersHookValue()
      await expect(resolveOpenId4VciOffer({ offer: { data: undefined, uri: undefined } })).rejects.toThrow()
    })
  })

  describe('acquireAccessToken', () => {
    it('should resolve access token (pre-auth)', async () => {
      mockFunction(mockAgent.openid4vc.holder.requestToken).mockResolvedValueOnce(fixture.tokenResponse)

      const { acquireAccessToken } = renderOpenIdHandlersHookValue()
      const tokenResponse = await acquireAccessToken({
        resolvedCredentialOffer: fixture.resolvedCredentialOfferPreAuth,
      })

      expect(tokenResponse).toBe(fixture.tokenResponse)

      expect(mockAgent.openid4vc.holder.requestToken).toHaveBeenCalledWith({
        resolvedCredentialOffer: fixture.resolvedCredentialOfferPreAuth,
        txCode: undefined,
      })
      expect(mockAgent.openid4vc.holder.requestToken).toHaveBeenCalledTimes(1)
    })

    it('should set txCode from pre-auth user PIN', async () => {
      mockFunction(mockAgent.openid4vc.holder.requestToken).mockResolvedValueOnce(fixture.tokenResponse)

      const { acquireAccessToken } = renderOpenIdHandlersHookValue()
      const tokenResponse = await acquireAccessToken({
        resolvedCredentialOffer: fixture.resolvedCredentialOfferPreAuth,
        userPin: mockUserPin,
      })

      expect(tokenResponse).toBe(fixture.tokenResponse)

      expect(mockAgent.openid4vc.holder.requestToken).toHaveBeenCalledWith({
        resolvedCredentialOffer: fixture.resolvedCredentialOfferPreAuth,
        txCode: mockUserPin,
      })
      expect(mockAgent.openid4vc.holder.requestToken).toHaveBeenCalledTimes(1)
    })

    it('should resolve access token (authorization code)', async () => {
      mockFunction(mockAgent.openid4vc.holder.requestToken).mockResolvedValueOnce(fixture.tokenResponse)

      const { acquireAccessToken } = renderOpenIdHandlersHookValue()
      const tokenResponse = await acquireAccessToken({
        resolvedCredentialOffer: fixture.resolvedCredentialOfferAuthorizationCode,
        resolvedAuthorizationRequest: fixture.resolvedIssuanceAuthorizationRequest,
      })

      expect(tokenResponse).toBe(fixture.tokenResponse)

      expect(mockAgent.openid4vc.holder.requestToken).toHaveBeenCalledWith(
        expect.objectContaining({
          resolvedCredentialOffer: fixture.resolvedCredentialOfferAuthorizationCode,
          codeVerifier: fixture.resolvedIssuanceAuthorizationRequest.codeVerifier,
        })
      )
      expect(mockAgent.openid4vc.holder.requestToken).toHaveBeenCalledTimes(1)
    })
  })

  describe('receiveCredentialFromOpenId4VciOffer', () => {
    it('should receive specified credential from resolved offer', async () => {
      const credentialConfiguration =
        fixture.resolvedCredentialOfferPreAuth.offeredCredentialConfigurations['mock-id-2']
      mockFunction(mockAgent.openid4vc.holder.requestCredentials).mockResolvedValueOnce({
        credentials: [{ record: { id: 'mock-record', metadata: { set: jest.fn() } }, credentialConfiguration }],
      })

      const { receiveCredentialFromOpenId4VciOffer } = renderOpenIdHandlersHookValue()
      const credentialRecord = await receiveCredentialFromOpenId4VciOffer({
        resolvedCredentialOffer: fixture.resolvedCredentialOfferPreAuth,
        accessToken: fixture.tokenResponse,
        credentialConfigurationIdToRequest: 'mock-id-2',
      })

      expect(credentialRecord).toMatchObject({ id: 'mock-record' })

      expect(mockAgent.openid4vc.holder.requestCredentials).toHaveBeenCalledWith(
        expect.objectContaining({
          resolvedCredentialOffer: fixture.resolvedCredentialOfferPreAuth,
          credentialConfigurationIds: ['mock-id-2'],
          verifyCredentialStatus: false,
          allowedProofOfPossessionSignatureAlgorithms: [
            Kms.KnownJwaSignatureAlgorithms.EdDSA,
            Kms.KnownJwaSignatureAlgorithms.ES256,
          ],
          credentialBindingResolver: expect.any(Function),
        })
      )
      expect(mockAgent.openid4vc.holder.requestCredentials).toHaveBeenCalledTimes(1)
    })

    it('should receive first supported credential from resolved offer if no id is specified', async () => {
      const credentialConfiguration =
        fixture.resolvedCredentialOfferPreAuth.offeredCredentialConfigurations['mock-id-1']
      mockFunction(mockAgent.openid4vc.holder.requestCredentials).mockResolvedValueOnce({
        credentials: [{ record: { id: 'mock-record', metadata: { set: jest.fn() } }, credentialConfiguration }],
      })

      const { receiveCredentialFromOpenId4VciOffer } = renderOpenIdHandlersHookValue()
      const credentialRecord = await receiveCredentialFromOpenId4VciOffer({
        resolvedCredentialOffer: mixedFormatResolvedCredentialOffer,
        accessToken: fixture.tokenResponse,
      })

      expect(credentialRecord).toMatchObject({ id: 'mock-record' })

      expect(mockAgent.openid4vc.holder.requestCredentials).toHaveBeenCalledWith(
        expect.objectContaining({
          resolvedCredentialOffer: mixedFormatResolvedCredentialOffer,
          credentialConfigurationIds: expect.any(Array),
          verifyCredentialStatus: false,
          allowedProofOfPossessionSignatureAlgorithms: [
            Kms.KnownJwaSignatureAlgorithms.EdDSA,
            Kms.KnownJwaSignatureAlgorithms.ES256,
          ],
          credentialBindingResolver: expect.any(Function),
        })
      )
      expect(mockAgent.openid4vc.holder.requestCredentials).toHaveBeenCalledTimes(1)
    })

    it('should throw if explicitly requested credential uses an unsupported format', async () => {
      const { receiveCredentialFromOpenId4VciOffer } = renderOpenIdHandlersHookValue()

      await expect(
        receiveCredentialFromOpenId4VciOffer({
          resolvedCredentialOffer: mixedFormatResolvedCredentialOffer,
          accessToken: fixture.tokenResponse,
          credentialConfigurationIdToRequest: Object.keys(
            mixedFormatResolvedCredentialOffer.offeredCredentialConfigurations
          )[0],
        })
      ).rejects.toThrow(/uses unsupported format 'jwt_vc'/)

      expect(mockAgent.openid4vc.holder.requestCredentials).toHaveBeenCalledTimes(0)
    })

    it('should throw if no offered credentials use a supported format', async () => {
      const unsupportedOnlyResolvedCredentialOffer: OpenId4VciResolvedCredentialOffer = {
        ...fixture.resolvedCredentialOfferPreAuth,
        offeredCredentialConfigurations: {
          'unsupported-only-id': {
            // @ts-expect-error - we're specifying unsupported format on purpose here (it also fails union type check)
            format: 'jwt_vc' as const,
            vct: 'empl:unsupported-only',
          },
        },
      }

      const { receiveCredentialFromOpenId4VciOffer } = renderOpenIdHandlersHookValue()

      await expect(
        receiveCredentialFromOpenId4VciOffer({
          resolvedCredentialOffer: unsupportedOnlyResolvedCredentialOffer,
          accessToken: fixture.tokenResponse,
        })
      ).rejects.toThrow(/No supported credential format found in the credential offer/)

      expect(mockAgent.openid4vc.holder.requestCredentials).toHaveBeenCalledTimes(0)
    })

    it('should throw on receiving empty response', async () => {
      mockFunction(mockAgent.openid4vc.holder.requestCredentials).mockResolvedValueOnce({ credentials: [] })

      const { receiveCredentialFromOpenId4VciOffer } = renderOpenIdHandlersHookValue()

      await expect(
        receiveCredentialFromOpenId4VciOffer({
          resolvedCredentialOffer: fixture.resolvedCredentialOfferPreAuth,
          accessToken: fixture.tokenResponse,
        })
      ).rejects.toThrow()
      expect(mockAgent.openid4vc.holder.requestCredentials).toHaveBeenCalledTimes(1)
    })

    it('should throw if requested credential configuration is not found', async () => {
      const { receiveCredentialFromOpenId4VciOffer } = renderOpenIdHandlersHookValue()

      await expect(
        receiveCredentialFromOpenId4VciOffer({
          resolvedCredentialOffer: fixture.resolvedCredentialOfferPreAuth,
          accessToken: fixture.tokenResponse,
          credentialConfigurationIdToRequest: 'not-found-id',
        })
      ).rejects.toThrow()
      expect(mockAgent.openid4vc.holder.requestCredentials).toHaveBeenCalledTimes(0)
    })
  })

  describe('resolveOpenId4VpPresentationRequest', () => {
    it('should resolve OID4VP presentation request', async () => {
      mockFunction(mockAgent.openid4vc.holder.resolveOpenId4VpAuthorizationRequest).mockResolvedValueOnce({
        presentationExchange: fixture.resolvedSiopAuthorizationRequest.presentationExchange,
        authorizationRequestPayload: {
          response_uri:
            'https://70ff-195-98-90-134.ngrok-free.app/openId/oid4vp/did:key:z6MkooobRCrvQ1N2fYFNVmvTUCVZhreUqXp69TPLjk7nNgae/authorize',
        },
      })

      const { resolveOpenId4VpPresentationRequest } = renderOpenIdHandlersHookValue()
      const resolvedPresentationRequest = await resolveOpenId4VpPresentationRequest({
        uri: fixture.presentationRequestUrl,
      })

      expect(resolvedPresentationRequest).toMatchObject({
        ...fixture.resolvedSiopAuthorizationRequest.presentationExchange,
        verifierHostName: getHostNameFromUrl(
          'https://70ff-195-98-90-134.ngrok-free.app/openId/oid4vp/did:key:z6MkooobRCrvQ1N2fYFNVmvTUCVZhreUqXp69TPLjk7nNgae/authorize'
        ),
      })

      expect(mockAgent.openid4vc.holder.resolveOpenId4VpAuthorizationRequest).toHaveBeenCalledWith(
        fixture.presentationRequestUrl,
        { origin: undefined }
      )
      expect(mockAgent.openid4vc.holder.resolveOpenId4VpAuthorizationRequest).toHaveBeenCalledTimes(1)
    })

    it('should throw if parsed request is empty', async () => {
      const { resolveOpenId4VpPresentationRequest } = renderOpenIdHandlersHookValue()
      await expect(resolveOpenId4VpPresentationRequest({ data: undefined, uri: undefined })).rejects.toThrow()
    })

    it('should throw if no presentation exchange or dcql data has been resolved', async () => {
      mockFunction(mockAgent.openid4vc.holder.resolveOpenId4VpAuthorizationRequest).mockResolvedValueOnce({
        presentationExchange: undefined,
        dcql: undefined,
        authorizationRequestPayload: {},
      })

      const { resolveOpenId4VpPresentationRequest } = renderOpenIdHandlersHookValue()
      await expect(resolveOpenId4VpPresentationRequest({ uri: fixture.presentationRequestUrl })).rejects.toThrow()

      expect(mockAgent.openid4vc.holder.resolveOpenId4VpAuthorizationRequest).toHaveBeenCalledWith(
        fixture.presentationRequestUrl,
        { origin: undefined }
      )
      expect(mockAgent.openid4vc.holder.resolveOpenId4VpAuthorizationRequest).toHaveBeenCalledTimes(1)
    })
  })

  describe('acceptOpenId4VpPresentationRequest', () => {
    it('should accept OID4VP presentation request and provide server response', async () => {
      const successfulResponse = { serverResponse: { status: 200 } }
      mockFunction(mockAgent.openid4vc.holder.acceptOpenId4VpAuthorizationRequest).mockResolvedValueOnce(
        successfulResponse
      )

      const { acceptOpenId4VpPresentationRequest } = renderOpenIdHandlersHookValue()
      const response = await acceptOpenId4VpPresentationRequest({
        submissionParams: {
          authorizationRequest: fixture.resolvedSiopAuthorizationRequest.authorizationRequestPayload,
          credentialsForRequest: fixture.resolvedSiopAuthorizationRequest.presentationExchange.credentialsForRequest,
        },
        selectedCredentials: fixture.presentationSubmissionParams.selectedCredentials,
      })

      expect(response).toBe(successfulResponse)

      expect(mockAgent.openid4vc.holder.acceptOpenId4VpAuthorizationRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          authorizationRequestPayload: fixture.resolvedSiopAuthorizationRequest.authorizationRequestPayload,
          presentationExchange: { credentials: expect.any(Object) },
        })
      )
      expect(mockAgent.openid4vc.holder.acceptOpenId4VpAuthorizationRequest).toHaveBeenCalledTimes(1)
    })

    it('should throw if credential requirements are not fulfilled', async () => {
      const failedCredentialsForRequest = {
        ...fixture.resolvedSiopAuthorizationRequest.presentationExchange.credentialsForRequest,
        areRequirementsSatisfied: false,
      }

      const { acceptOpenId4VpPresentationRequest } = renderOpenIdHandlersHookValue()
      await expect(
        acceptOpenId4VpPresentationRequest({
          submissionParams: {
            authorizationRequest: fixture.resolvedSiopAuthorizationRequest.authorizationRequestPayload,
            credentialsForRequest: failedCredentialsForRequest,
          },
          selectedCredentials: fixture.presentationSubmissionParams.selectedCredentials,
        })
      ).rejects.toThrow()

      expect(mockAgent.openid4vc.holder.acceptOpenId4VpAuthorizationRequest).toHaveBeenCalledTimes(0)
    })

    it('should throw on unsuccessful server response', async () => {
      mockFunction(mockAgent.openid4vc.holder.acceptOpenId4VpAuthorizationRequest).mockResolvedValueOnce({
        serverResponse: { status: 500 },
      })

      const { acceptOpenId4VpPresentationRequest } = renderOpenIdHandlersHookValue()
      await expect(
        acceptOpenId4VpPresentationRequest({
          submissionParams: {
            authorizationRequest: fixture.resolvedSiopAuthorizationRequest.authorizationRequestPayload,
            credentialsForRequest: fixture.resolvedSiopAuthorizationRequest.presentationExchange.credentialsForRequest,
          },
          selectedCredentials: fixture.presentationSubmissionParams.selectedCredentials,
        })
      ).rejects.toThrow()

      expect(mockAgent.openid4vc.holder.acceptOpenId4VpAuthorizationRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          authorizationRequestPayload: fixture.resolvedSiopAuthorizationRequest.authorizationRequestPayload,
          presentationExchange: { credentials: expect.any(Object) },
        })
      )
      expect(mockAgent.openid4vc.holder.acceptOpenId4VpAuthorizationRequest).toHaveBeenCalledTimes(1)
    })
  })
})
