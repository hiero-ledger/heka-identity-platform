import { render, screen, waitFor } from '@testing-library/react-native'
import React from 'react'
import { DeviceEventEmitter } from 'react-native'

import { mapAnoncredsProofExchangeRecord } from '../../src/credentials'
import { AriesPresentationRequest } from '../../src/screens/AriesPresentationRequest'

import { mockFunction } from '../../../jest-helpers/helpers'

jest.mock('@bifold/core', () => ({
  BifoldError: class extends Error {
    constructor(title: string, description: string, message: string, code: number) {
      super(message)
      Object.assign(this, { title, description, code })
    }
  },
  EventTypes: { ERROR_ADDED: 'ErrorAdded' },
  Screens: { ProofRequest: 'ProofRequest', Home: 'Home' },
  TabStacks: { HomeStack: 'HomeStack' },
  useNetwork: () => ({ assertNetworkConnected: () => true }),
}))

jest.mock('@bifold/react-hooks', () => {
  const record = { id: 'proof-id' }
  return { useProofById: () => record }
})

jest.mock('@credo-ts/anoncreds', () => ({}))
jest.mock('@credo-ts/core', () => ({ ClaimFormat: {} }))
jest.mock('@credo-ts/didcomm', () => ({}))

jest.mock('@react-navigation/native', () => {
  const navigation = { getParent: () => undefined }
  return { useNavigation: () => navigation }
})

jest.mock('react-i18next', () => {
  const translation = { t: (key: string) => key }
  return { useTranslation: () => translation }
})

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}))

jest.mock('../../src/components/views', () => {
  const { Text } = jest.requireActual('react-native')
  return {
    PresentationRequestView: ({ presentationSubmission }: { presentationSubmission: { verifierName: string } }) => (
      <Text>{`request from ${presentationSubmission.verifierName}`}</Text>
    ),
  }
})
jest.mock('../../src/components/views/LoadingView', () => {
  const { Text } = jest.requireActual('react-native')
  return { __esModule: true, default: () => <Text>loading</Text> }
})

jest.mock('../../src/credentials', () => ({
  mapAnoncredsProofExchangeRecord: jest.fn(),
  ProofExchangeFormatKeys: {},
}))

jest.mock('../../src/utils/agent', () => {
  const agent = { config: { logger: { error: jest.fn() } } }
  return { useHekaAgent: () => ({ agent }) }
})

const route = { key: 'ProofRequest', name: 'ProofRequest', params: { proofId: 'proof-id' } } as never

describe('AriesPresentationRequest', () => {
  it('shows the mapped proof request', async () => {
    const emitSpy = jest.spyOn(DeviceEventEmitter, 'emit')
    mockFunction(mapAnoncredsProofExchangeRecord).mockResolvedValue({ verifierName: 'Verifier' } as never)

    render(<AriesPresentationRequest route={route} navigation={{} as never} />)

    expect(await screen.findByText('request from Verifier')).toBeTruthy()
    expect(screen.queryByText('loading')).toBeNull()
    expect(emitSpy).not.toBeCalledWith('ErrorAdded', expect.anything())
  })

  it('reports a proof request that cannot be mapped as error 1027', async () => {
    const emitSpy = jest.spyOn(DeviceEventEmitter, 'emit')
    mockFunction(mapAnoncredsProofExchangeRecord).mockRejectedValue(new Error('Mapping failed'))

    render(<AriesPresentationRequest route={route} navigation={{} as never} />)

    await waitFor(() =>
      expect(emitSpy).toBeCalledWith('ErrorAdded', expect.objectContaining({ code: 1027, message: 'Mapping failed' }))
    )
  })
})
