import { renderHook } from '@testing-library/react-native'
import { mockFunction } from '../../../jest-helpers/helpers'
import { useOpenIdHandlers } from '../../src/credentials/useOpenIdHandlers'
import { hekaIdentityServiceSdJwtVc } from './fixtures'
import { JwaSignatureAlgorithm, SdJwtVcRecord } from '@credo-ts/core'
import { getHostNameFromUrl } from '@heka-wallet/shared'

const mockPublicDid = 'did:key:mock-key-fingerprint'
const mockAuthorizationCode = 'mock-auth-code'
const mockUserPin = 'mock-user-pin'

const mockAgent = {
  modules: {
    openId4VcHolder: {
      resolveCredentialOffer: jest.fn(),
      resolveIssuanceAuthorizationRequest: jest.fn(),
      resolveSiopAuthorizationRequest: jest.fn(),
      acceptSiopAuthorizationRequest: jest.fn(),
      requestToken: jest.fn(),
      requestCredentials: jest.fn(),
    },
  },
  config: {
    logger: {
      info: jest.fn(),
    },
  },
}

jest.mock('@credo-ts/react-hooks', () => ({
  useAgent: jest.fn(() => ({ loading: false, agent: mockAgent, publicDid: mockPublicDid })),
}))

function renderOpenIdHandlersHookValue() {
  const { result } = renderHook(() => useOpenIdHandlers())
  return result.current
}

describe('useOpenIdHandlers', () => {
  const fixture = hekaIdentityServiceSdJwtVc

  describe('resolveOpenId4VciOffer', () => {
    it('should resolve OID4VCI offer (pre-auth)', async () => {
      mockFunction(mockAgent.modules.openId4VcHolder.resolveCredentialOffer).mockResolvedValueOnce(
        fixture.resolvedCredentialOfferPreAuth
      )

      const { resolveOpenId4VciOffer } = renderOpenIdHandlersHookValue()
      const { resolvedCredentialOffer, resolvedAuthorizationRequest } = await resolveOpenId4VciOffer({
        offer: { uri: fixture.credentialOfferUrl },
      })

      expect(resolvedCredentialOffer).toBe(fixture.resolvedCredentialOfferPreAuth)
      expect(resolvedAuthorizationRequest).toBeUndefined()

      expect(mockAgent.modules.openId4VcHolder.resolveCredentialOffer).toHaveBeenCalledWith(fixture.credentialOfferUrl)
      expect(mockAgent.modules.openId4VcHolder.resolveCredentialOffer).toHaveBeenCalledTimes(1)

      expect(mockAgent.modules.openId4VcHolder.resolveIssuanceAuthorizationRequest).toHaveBeenCalledTimes(0)
    })

    it('should resolve OID4VCI offer (authorization code)', async () => {
      mockFunction(mockAgent.modules.openId4VcHolder.resolveCredentialOffer).mockResolvedValueOnce(
        fixture.resolvedCredentialOfferAuthorizationCode
      )
      mockFunction(mockAgent.modules.openId4VcHolder.resolveIssuanceAuthorizationRequest).mockResolvedValueOnce(
        fixture.resolvedIssuanceAuthorizationRequest
      )

      const { resolveOpenId4VciOffer } = renderOpenIdHandlersHookValue()
      const { resolvedCredentialOffer, resolvedAuthorizationRequest } = await resolveOpenId4VciOffer({
        offer: { uri: fixture.credentialOfferUrl },
        authorization: fixture.authorizationParams,
      })

      expect(resolvedCredentialOffer).toBe(fixture.resolvedCredentialOfferAuthorizationCode)
      expect(resolvedAuthorizationRequest).toBe(fixture.resolvedIssuanceAuthorizationRequest)

      expect(mockAgent.modules.openId4VcHolder.resolveCredentialOffer).toHaveBeenCalledWith(fixture.credentialOfferUrl)
      expect(mockAgent.modules.openId4VcHolder.resolveCredentialOffer).toHaveBeenCalledTimes(1)

      expect(mockAgent.modules.openId4VcHolder.resolveIssuanceAuthorizationRequest).toHaveBeenCalledWith(
        resolvedCredentialOffer,
        {
          scope: Array.from(
            new Set(
              resolvedCredentialOffer.offeredCredentials
                .map((credential) => credential.scope)
                .filter((scope): scope is string => scope !== undefined)
            )
          ),
          redirectUri: fixture.authorizationParams.redirectUri,
          clientId: fixture.authorizationParams.clientId,
        }
      )
      expect(mockAgent.modules.openId4VcHolder.resolveIssuanceAuthorizationRequest).toHaveBeenCalledTimes(1)
    })

    it('should throw if no authorization params provided for authorization code flow', async () => {
      mockFunction(mockAgent.modules.openId4VcHolder.resolveCredentialOffer).mockResolvedValueOnce(
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
      mockFunction(mockAgent.modules.openId4VcHolder.requestToken).mockResolvedValueOnce(fixture.tokenResponse)

      const { acquireAccessToken } = renderOpenIdHandlersHookValue()
      const tokenResponse = await acquireAccessToken({
        resolvedCredentialOffer: fixture.resolvedCredentialOfferPreAuth,
      })

      expect(tokenResponse).toBe(fixture.tokenResponse)

      expect(mockAgent.modules.openId4VcHolder.requestToken).toHaveBeenCalledWith({
        resolvedCredentialOffer: fixture.resolvedCredentialOfferPreAuth,
        txCode: undefined,
      })
      expect(mockAgent.modules.openId4VcHolder.requestToken).toHaveBeenCalledTimes(1)
    })

    it('should set txCode from pre-auth user PIN', async () => {
      mockFunction(mockAgent.modules.openId4VcHolder.requestToken).mockResolvedValueOnce(fixture.tokenResponse)

      const { acquireAccessToken } = renderOpenIdHandlersHookValue()
      const tokenResponse = await acquireAccessToken({
        resolvedCredentialOffer: fixture.resolvedCredentialOfferPreAuth,
        userPin: mockUserPin,
      })

      expect(tokenResponse).toBe(fixture.tokenResponse)

      expect(mockAgent.modules.openId4VcHolder.requestToken).toHaveBeenCalledWith({
        resolvedCredentialOffer: fixture.resolvedCredentialOfferPreAuth,
        txCode: mockUserPin,
      })
      expect(mockAgent.modules.openId4VcHolder.requestToken).toHaveBeenCalledTimes(1)
    })

    it('should resolve access token (authorization code)', async () => {
      const authorizationRequestWithCode = {
        ...fixture.resolvedIssuanceAuthorizationRequest,
        code: mockAuthorizationCode,
      }
      mockFunction(mockAgent.modules.openId4VcHolder.requestToken).mockResolvedValueOnce(fixture.tokenResponse)

      const { acquireAccessToken } = renderOpenIdHandlersHookValue()
      const tokenResponse = await acquireAccessToken({
        resolvedCredentialOffer: fixture.resolvedCredentialOfferAuthorizationCode,
        resolvedAuthorizationRequest: authorizationRequestWithCode,
      })

      expect(tokenResponse).toBe(fixture.tokenResponse)

      expect(mockAgent.modules.openId4VcHolder.requestToken).toHaveBeenCalledWith({
        resolvedCredentialOffer: fixture.resolvedCredentialOfferAuthorizationCode,
        resolvedAuthorizationRequest: authorizationRequestWithCode,
        code: authorizationRequestWithCode.code,
        txCode: undefined,
      })
      expect(mockAgent.modules.openId4VcHolder.requestToken).toHaveBeenCalledTimes(1)
    })
  })

  describe('receiveCredentialFromOpenId4VciOffer', () => {
    it('should receive specified credential from resolved offer', async () => {
      mockFunction(mockAgent.modules.openId4VcHolder.requestCredentials).mockResolvedValueOnce(
        fixture.requestCredentialsResponse
      )

      const { receiveCredentialFromOpenId4VciOffer } = renderOpenIdHandlersHookValue()
      const credentialIdToRequest = fixture.resolvedCredentialOfferPreAuth.offeredCredentials[1].id
      const credentialRecord = (await receiveCredentialFromOpenId4VciOffer({
        resolvedCredentialOffer: fixture.resolvedCredentialOfferPreAuth,
        accessToken: fixture.tokenResponse,
        credentialConfigurationIdToRequest: credentialIdToRequest,
      })) as SdJwtVcRecord

      const issuedCredential = fixture.requestCredentialsResponse[0]
      expect(credentialRecord.compactSdJwtVc).toBe(issuedCredential.credential.compact)

      expect(mockAgent.modules.openId4VcHolder.requestCredentials).toHaveBeenCalledWith({
        resolvedCredentialOffer: fixture.resolvedCredentialOfferPreAuth,
        ...fixture.tokenResponse,
        clientId: undefined,
        credentialsToRequest: [credentialIdToRequest],
        verifyCredentialStatus: false,
        allowedProofOfPossessionSignatureAlgorithms: [JwaSignatureAlgorithm.ES256],
        credentialBindingResolver: expect.any(Function),
      })
      expect(mockAgent.modules.openId4VcHolder.requestCredentials).toHaveBeenCalledTimes(1)
    })

    it('should receive first credential from resolved offer if no id is specified', async () => {
      mockFunction(mockAgent.modules.openId4VcHolder.requestCredentials).mockResolvedValueOnce(
        fixture.requestCredentialsResponse
      )

      const { receiveCredentialFromOpenId4VciOffer } = renderOpenIdHandlersHookValue()
      const credentialRecord = (await receiveCredentialFromOpenId4VciOffer({
        resolvedCredentialOffer: fixture.resolvedCredentialOfferPreAuth,
        accessToken: fixture.tokenResponse,
      })) as SdJwtVcRecord

      const issuedCredential = fixture.requestCredentialsResponse[0]
      expect(credentialRecord.compactSdJwtVc).toBe(issuedCredential.credential.compact)

      expect(mockAgent.modules.openId4VcHolder.requestCredentials).toHaveBeenCalledWith({
        resolvedCredentialOffer: fixture.resolvedCredentialOfferPreAuth,
        ...fixture.tokenResponse,
        clientId: undefined,
        credentialsToRequest: [fixture.resolvedCredentialOfferPreAuth.offeredCredentials[0].id],
        verifyCredentialStatus: false,
        allowedProofOfPossessionSignatureAlgorithms: [JwaSignatureAlgorithm.ES256],
        credentialBindingResolver: expect.any(Function),
      })
      expect(mockAgent.modules.openId4VcHolder.requestCredentials).toHaveBeenCalledTimes(1)
    })

    it('should throw on receiving empty response', async () => {
      mockFunction(mockAgent.modules.openId4VcHolder.requestCredentials).mockResolvedValueOnce([])

      const { receiveCredentialFromOpenId4VciOffer } = renderOpenIdHandlersHookValue()

      await expect(
        receiveCredentialFromOpenId4VciOffer({
          resolvedCredentialOffer: fixture.resolvedCredentialOfferPreAuth,
          accessToken: fixture.tokenResponse,
        })
      ).rejects.toThrow()
      expect(mockAgent.modules.openId4VcHolder.requestCredentials).toHaveBeenCalledTimes(1)
    })

    it('should throw if requested credential configuration is not found', async () => {
      mockFunction(mockAgent.modules.openId4VcHolder.requestCredentials).mockResolvedValueOnce(
        fixture.resolvedCredentialOfferPreAuth
      )

      const { receiveCredentialFromOpenId4VciOffer } = renderOpenIdHandlersHookValue()

      await expect(
        receiveCredentialFromOpenId4VciOffer({
          resolvedCredentialOffer: fixture.resolvedCredentialOfferPreAuth,
          accessToken: fixture.tokenResponse,
          credentialConfigurationIdToRequest: 'not-found-id',
        })
      ).rejects.toThrow()
      expect(mockAgent.modules.openId4VcHolder.requestCredentials).toHaveBeenCalledTimes(0)
    })
  })

  describe('resolveOpenId4VpPresentationRequest', () => {
    it('should resolve OID4VP presentation request', async () => {
      mockFunction(mockAgent.modules.openId4VcHolder.resolveSiopAuthorizationRequest).mockResolvedValueOnce(
        fixture.resolvedSiopAuthorizationRequest
      )

      const { resolveOpenId4VpPresentationRequest } = renderOpenIdHandlersHookValue()
      const resolvedPresentationRequest = await resolveOpenId4VpPresentationRequest({
        uri: fixture.presentationRequestUrl,
      })

      const expectedPresentationRequest = {
        ...fixture.resolvedSiopAuthorizationRequest.presentationExchange,
        authorizationRequest: fixture.resolvedSiopAuthorizationRequest.authorizationRequest,
        verifierHostName: getHostNameFromUrl(
          fixture.resolvedSiopAuthorizationRequest.authorizationRequest.responseURI!
        ),
      }
      expect(resolvedPresentationRequest).toStrictEqual(expectedPresentationRequest)

      expect(mockAgent.modules.openId4VcHolder.resolveSiopAuthorizationRequest).toHaveBeenCalledWith(
        fixture.presentationRequestUrl
      )
      expect(mockAgent.modules.openId4VcHolder.resolveSiopAuthorizationRequest).toHaveBeenCalledTimes(1)
    })

    it('should throw if parsed request is empty', async () => {
      const { resolveOpenId4VpPresentationRequest } = renderOpenIdHandlersHookValue()
      await expect(resolveOpenId4VpPresentationRequest({ data: undefined, uri: undefined })).rejects.toThrow()
    })

    it('should throw if no presentation exchange data has been resolved', async () => {
      mockFunction(mockAgent.modules.openId4VcHolder.resolveSiopAuthorizationRequest).mockResolvedValueOnce({
        ...fixture.resolvedSiopAuthorizationRequest,
        presentationExchange: undefined,
      })

      const { resolveOpenId4VpPresentationRequest } = renderOpenIdHandlersHookValue()
      await expect(resolveOpenId4VpPresentationRequest({ uri: fixture.presentationRequestUrl })).rejects.toThrow()

      expect(mockAgent.modules.openId4VcHolder.resolveSiopAuthorizationRequest).toHaveBeenCalledWith(
        fixture.presentationRequestUrl
      )
      expect(mockAgent.modules.openId4VcHolder.resolveSiopAuthorizationRequest).toHaveBeenCalledTimes(1)
    })
  })

  describe('acceptOpenId4VpPresentationRequest', () => {
    it('should accept OID4VP presentation request and provide server response', async () => {
      const successfulResponse = { serverResponse: { status: 200 } }
      mockFunction(mockAgent.modules.openId4VcHolder.acceptSiopAuthorizationRequest).mockResolvedValueOnce(
        successfulResponse
      )

      const { acceptOpenId4VpPresentationRequest } = renderOpenIdHandlersHookValue()
      const response = await acceptOpenId4VpPresentationRequest({
        authorizationRequest: fixture.resolvedSiopAuthorizationRequest.authorizationRequest,
        credentialsForRequest: fixture.resolvedSiopAuthorizationRequest.presentationExchange.credentialsForRequest,
        selectedCredentials: fixture.presentationSubmissionParams.selectedCredentials,
      })

      expect(response).toBe(successfulResponse)

      expect(mockAgent.modules.openId4VcHolder.acceptSiopAuthorizationRequest).toHaveBeenCalledWith({
        authorizationRequest: fixture.resolvedSiopAuthorizationRequest.authorizationRequest,
        // TODO: Checks for SD-JWT credential records
        presentationExchange: { credentials: expect.any(Object) },
      })
      expect(mockAgent.modules.openId4VcHolder.acceptSiopAuthorizationRequest).toHaveBeenCalledTimes(1)
    })

    it('should throw if credential requirements are not fulfilled', async () => {
      const failedCredentialsForRequest = {
        ...fixture.resolvedSiopAuthorizationRequest.presentationExchange.credentialsForRequest,
        areRequirementsSatisfied: false,
      }

      const { acceptOpenId4VpPresentationRequest } = renderOpenIdHandlersHookValue()
      await expect(
        acceptOpenId4VpPresentationRequest({
          authorizationRequest: fixture.resolvedSiopAuthorizationRequest.authorizationRequest,
          credentialsForRequest: failedCredentialsForRequest,
          selectedCredentials: fixture.presentationSubmissionParams.selectedCredentials,
        })
      ).rejects.toThrow()

      expect(mockAgent.modules.openId4VcHolder.acceptSiopAuthorizationRequest).toHaveBeenCalledTimes(0)
    })

    it('should throw on unsuccessful server response', async () => {
      mockFunction(mockAgent.modules.openId4VcHolder.acceptSiopAuthorizationRequest).mockResolvedValueOnce({
        serverResponse: { status: 500 },
      })

      const { acceptOpenId4VpPresentationRequest } = renderOpenIdHandlersHookValue()
      await expect(
        acceptOpenId4VpPresentationRequest({
          authorizationRequest: fixture.resolvedSiopAuthorizationRequest.authorizationRequest,
          credentialsForRequest: fixture.resolvedSiopAuthorizationRequest.presentationExchange.credentialsForRequest,
          selectedCredentials: fixture.presentationSubmissionParams.selectedCredentials,
        })
      ).rejects.toThrow()

      expect(mockAgent.modules.openId4VcHolder.acceptSiopAuthorizationRequest).toHaveBeenCalledWith({
        authorizationRequest: fixture.resolvedSiopAuthorizationRequest.authorizationRequest,
        // TODO: Checks for SD-JWT credential records
        presentationExchange: { credentials: expect.any(Object) },
      })
      expect(mockAgent.modules.openId4VcHolder.acceptSiopAuthorizationRequest).toHaveBeenCalledTimes(1)
    })
  })
})
