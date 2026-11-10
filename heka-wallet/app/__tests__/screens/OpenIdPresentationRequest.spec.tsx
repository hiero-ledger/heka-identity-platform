import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import React from 'react'
import { DeviceEventEmitter } from 'react-native'

import { mapOpenId4VcPresentationRequest } from '../../src/credentials'
import { PresentationRejectedError } from '../../src/credentials/openid4vc/presentationErrors'
import { OpenIdPresentationRequest } from '../../src/screens/OpenIdPresentationRequest'

import { mockFunction } from '../../../jest-helpers/helpers'

jest.mock('@bifold/core', () => ({
  BifoldError: class extends Error {
    constructor(title: string, description: string, message: string, code: number) {
      super(message)
      Object.assign(this, { title, description, code })
    }
  },
  EventTypes: { ERROR_ADDED: 'ErrorAdded' },
  Screens: { Home: 'Home' },
  TabStacks: { HomeStack: 'HomeStack' },
}))

jest.mock('react-i18next', () => {
  const translation = { t: (key: string) => key }
  return { useTranslation: () => translation }
})

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}))

jest.mock('../../src/components/views', () => {
  const { Pressable, Text } = jest.requireActual('react-native')
  return {
    PresentationRequestView: ({ onAccept }: { onAccept: () => Promise<void> }) => (
      <Pressable onPress={onAccept}>
        <Text>share</Text>
      </Pressable>
    ),
  }
})
jest.mock('../../src/components/views/LoadingView', () => {
  const { Text } = jest.requireActual('react-native')
  return { __esModule: true, default: () => <Text>loading</Text> }
})

const mockAcceptOpenId4VpPresentationRequest = jest.fn()
const mockResolveOpenId4VpPresentationRequest = jest.fn()

jest.mock('../../src/credentials', () => ({
  ...jest.requireActual('../../src/credentials/openid4vc/presentationErrors'),
  mapOpenId4VcPresentationRequest: jest.fn(),
  useOpenIdHandlers: () => ({
    resolveOpenId4VpPresentationRequest: mockResolveOpenId4VpPresentationRequest,
    acceptOpenId4VpPresentationRequest: mockAcceptOpenId4VpPresentationRequest,
  }),
}))

jest.mock('../../src/utils/agent', () => {
  const agent = {}
  return { useHekaAgent: () => ({ agent }) }
})

const route = {
  key: 'OpenIdPresentationRequest',
  name: 'OpenIdPresentationRequest',
  params: { request: { uri: 'openid4vp://?request_uri=https://verifier.example/request' } },
} as never
const navigation = { getParent: () => undefined } as never

const rejectedResponseBody = {
  error: 'invalid_request',
  error_description: 'One or more presentations failed verification.',
}

async function shareAndGetReportedError(acceptError: unknown) {
  const emitSpy = jest.spyOn(DeviceEventEmitter, 'emit')
  const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined)
  mockResolveOpenId4VpPresentationRequest.mockResolvedValue({})
  mockFunction(mapOpenId4VcPresentationRequest).mockResolvedValue({
    submissionParams: {},
    entries: [{ inputDescriptorId: 'employee', selectedOption: { credential: { id: 'sd-jwt-vc-record' } } }],
  } as never)
  mockAcceptOpenId4VpPresentationRequest.mockRejectedValue(acceptError)

  render(<OpenIdPresentationRequest route={route} navigation={navigation} />)
  fireEvent.press(await screen.findByText('share'))

  await waitFor(() => expect(emitSpy).toBeCalledWith('ErrorAdded', expect.anything()))
  const reported = emitSpy.mock.calls.find(([event]) => event === 'ErrorAdded')![1] as {
    title: string
    message: string
    code: number
  }
  return { reported, consoleErrorSpy }
}

describe('OpenIdPresentationRequest', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('explains a presentation the verifier could not verify, without the raw response', async () => {
    const { reported, consoleErrorSpy } = await shareAndGetReportedError(
      new PresentationRejectedError({ status: 400, body: rejectedResponseBody })
    )

    expect(reported).toMatchObject({
      title: 'ProofRequest.VerificationFailedTitle',
      message: 'ProofRequest.VerificationFailedMessage',
      code: 1027,
    })
    expect(reported.message).not.toContain('{')
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      `Couldn't accept OpenID4VP presentation request`,
      expect.objectContaining({ status: 400, oauthError: 'invalid_request' })
    )
  })

  it('does not show a JSON blob from any other error', async () => {
    const { reported } = await shareAndGetReportedError(
      new Error(`Error while accepting authorization request. ${JSON.stringify(rejectedResponseBody)}`)
    )

    expect(reported).toMatchObject({ title: 'Error.Title1027', message: 'Error.Message1027', code: 1027 })
  })

  it('keeps a plain error message for other errors', async () => {
    const { reported } = await shareAndGetReportedError(new Error('Network request failed'))

    expect(reported).toMatchObject({ title: 'Error.Title1027', message: 'Network request failed', code: 1027 })
  })

  it('shows the share button again after a failed share', async () => {
    await shareAndGetReportedError(new PresentationRejectedError({ status: 400, body: rejectedResponseBody }))

    expect(await screen.findByText('share')).toBeTruthy()
  })
})
