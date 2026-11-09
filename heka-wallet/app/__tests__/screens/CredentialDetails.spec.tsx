import { DidCommCredentialExchangeRecord } from '@credo-ts/didcomm'
import { BottomTabBarHeightContext } from '@react-navigation/bottom-tabs'
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import React from 'react'
import { DeviceEventEmitter } from 'react-native'

import { mapCredentialRecord } from '../../src/credentials'
import { CredentialDetails } from '../../src/screens/CredentialDetails'

import { mockFunction } from '../../../jest-helpers/helpers'

const CUSTOM_METADATA_KEY = 'customMetadata'

jest.mock('@bifold/core', () => ({
  BifoldError: class extends Error {
    constructor(title: string, description: string, message: string, code: number) {
      super(message)
      Object.assign(this, { title, description, code })
    }
  },
  CredentialMetadata: { customMetadata: 'customMetadata' },
  EventTypes: { ERROR_ADDED: 'ErrorAdded' },
  Screens: { CredentialDetails: 'CredentialDetails' },
  formatTime: (date: Date) => `formatted ${date.toISOString()}`,
}))

jest.mock('@credo-ts/didcomm', () => {
  class DidCommCredentialExchangeRecord {
    public id: string
    public revocationNotification?: { revocationDate: Date | string; comment?: string }
    private readonly data: Record<string, Record<string, unknown>> = {}
    public metadata = {
      get: (key: string) => this.data[key] ?? null,
      set: (key: string, value: Record<string, unknown>) => {
        this.data[key] = value
      },
    }

    public constructor(props: {
      id: string
      revocationNotification?: { revocationDate: Date | string; comment?: string }
    }) {
      this.id = props.id
      this.revocationNotification = props.revocationNotification
    }
  }
  return { DidCommCredentialExchangeRecord }
})

jest.mock('@heka-wallet/shared', () => {
  const theme = {
    BorderRadius: {},
    ColorPalette: { semantic: {} },
    IconSizes: {},
    Spacing: { md: 16 },
    TabTheme: { tabBarStyle: { position: 'absolute', height: 65, marginBottom: 16 } },
    TextTheme: { bold: {}, normal: {}, labelTitle: {} },
  }
  return { useHekaTheme: () => theme }
})

jest.mock('react-i18next', () => {
  const translation = { t: (key: string) => key }
  return { useTranslation: () => translation }
})

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}))

jest.mock('react-native-vector-icons/MaterialIcons', () => () => null)

jest.mock('../../src/components/cards', () => {
  const { Text } = jest.requireActual('react-native')
  return {
    CredentialCard: ({ credentialDisplay }: { credentialDisplay: { name: string } }) => (
      <Text>{credentialDisplay.name}</Text>
    ),
  }
})

const mockRecordProps = jest.fn()

jest.mock('../../src/components/misc', () => ({
  Record: (props: { header: () => React.ReactElement }) => {
    mockRecordProps(props)
    return props.header()
  },
}))

jest.mock('../../src/components/misc/CredentialContextMenu', () => ({ __esModule: true, default: () => null }))

jest.mock('../../src/components/views/LoadingView', () => {
  const { Text } = jest.requireActual('react-native')
  return { __esModule: true, default: () => <Text>loading</Text> }
})

jest.mock('../../src/credentials', () => ({ mapCredentialRecord: jest.fn() }))

const mockGetById = jest.fn()
const mockUpdate = jest.fn()
const mockLoggerError = jest.fn()

jest.mock('../../src/utils/agent', () => {
  const agent = {
    didcomm: {
      credentials: {
        getById: (...args: unknown[]) => mockGetById(...args),
        update: (...args: unknown[]) => mockUpdate(...args),
      },
    },
    config: { logger: { error: (...args: unknown[]) => mockLoggerError(...args) } },
  }
  return { useHekaAgent: () => ({ agent }) }
})

const REVOCATION_DATE = '2026-11-09T10:00:00.000Z'

const createRecord = (revocationNotification?: { revocationDate: Date | string; comment?: string }) =>
  new (DidCommCredentialExchangeRecord as unknown as new (props: object) => DidCommCredentialExchangeRecord)({
    id: 'credential-exchange-id',
    revocationNotification,
  })

const toCredential = (record: DidCommCredentialExchangeRecord) => ({
  id: record.id,
  type: 'w3c-anoncreds-credential',
  record,
  display: { name: 'Diploma', attributes: [], issuer: { name: 'University' } },
})

const navigation = { setOptions: jest.fn() }

const renderDetails = (credentialId: unknown) =>
  render(
    <CredentialDetails
      navigation={navigation as never}
      route={{ key: 'CredentialDetails', name: 'CredentialDetails', params: { credentialId } } as never}
    />
  )

describe('CredentialDetails', () => {
  beforeEach(() => {
    mockUpdate.mockResolvedValue(undefined)
    mockFunction(mapCredentialRecord).mockImplementation(
      async (record) => toCredential(record as DidCommCredentialExchangeRecord) as never
    )
  })

  it('opens a revoked credential by exchange record id and shows that it is revoked', async () => {
    const emitSpy = jest.spyOn(DeviceEventEmitter, 'emit')
    const record = createRecord({ revocationDate: REVOCATION_DATE, comment: 'Revoked by the issuer' })
    mockGetById.mockResolvedValue(record)

    renderDetails('credential-exchange-id')

    expect(await screen.findByText('Diploma')).toBeTruthy()
    expect(mockGetById).toBeCalledWith('credential-exchange-id')
    expect(screen.getByText('CredentialDetails.CredentialRevokedMessageTitle')).toBeTruthy()
    expect(screen.getByText(`CredentialDetails.Revoked: formatted ${REVOCATION_DATE}`)).toBeTruthy()
    expect(screen.getByText('Revoked by the issuer')).toBeTruthy()
    expect(emitSpy).not.toBeCalledWith('ErrorAdded', expect.anything())
  })

  it('marks the revocation as seen so the notification is removed', async () => {
    const record = createRecord({ revocationDate: REVOCATION_DATE })
    mockGetById.mockResolvedValue(record)

    renderDetails('credential-exchange-id')

    await waitFor(() => expect(mockUpdate).toBeCalledWith(record))
    expect(mockUpdate).toBeCalledTimes(1)
    expect(record.metadata.get(CUSTOM_METADATA_KEY)).toEqual({ revoked_seen: true })
  })

  it('shows the default revocation message when the issuer sent no comment', async () => {
    mockGetById.mockResolvedValue(createRecord({ revocationDate: REVOCATION_DATE }))

    renderDetails('credential-exchange-id')

    expect(await screen.findByText('CredentialDetails.CredentialRevokedMessageBody')).toBeTruthy()
  })

  it('hides the revocation message after it is dismissed and remembers it', async () => {
    const record = createRecord({ revocationDate: REVOCATION_DATE, comment: 'Revoked by the issuer' })
    mockGetById.mockResolvedValue(record)

    renderDetails('credential-exchange-id')

    fireEvent.press(await screen.findByLabelText('Global.Dismiss'))

    expect(screen.queryByText('Revoked by the issuer')).toBeNull()
    // The revoked state itself stays visible
    expect(screen.getByText('CredentialDetails.CredentialRevokedMessageTitle')).toBeTruthy()
    expect(screen.getByText(`CredentialDetails.Revoked: formatted ${REVOCATION_DATE}`)).toBeTruthy()
    await waitFor(() =>
      expect(record.metadata.get(CUSTOM_METADATA_KEY)).toEqual({ revoked_seen: true, revoked_detail_dismissed: true })
    )
  })

  it('does not update a revocation that was already seen and keeps a dismissed message hidden', async () => {
    const record = createRecord({ revocationDate: REVOCATION_DATE, comment: 'Revoked by the issuer' })
    record.metadata.set(CUSTOM_METADATA_KEY, { revoked_seen: true, revoked_detail_dismissed: true })

    renderDetails(toCredential(record))

    expect(await screen.findByText('CredentialDetails.CredentialRevokedMessageTitle')).toBeTruthy()
    expect(screen.queryByText('Revoked by the issuer')).toBeNull()
    expect(mockUpdate).not.toBeCalled()
  })

  it('shows the revoked state for a credential opened from the credential list', async () => {
    const record = createRecord({ revocationDate: REVOCATION_DATE })

    renderDetails(toCredential(record))

    expect(await screen.findByText('CredentialDetails.CredentialRevokedMessageTitle')).toBeTruthy()
    expect(mockGetById).not.toBeCalled()
    await waitFor(() => expect(record.metadata.get(CUSTOM_METADATA_KEY)).toEqual({ revoked_seen: true }))
  })

  it('does not show revocation info for a credential that is not revoked', async () => {
    mockGetById.mockResolvedValue(createRecord())

    renderDetails('credential-exchange-id')

    expect(await screen.findByText('Diploma')).toBeTruthy()
    expect(screen.queryByText('CredentialDetails.CredentialRevokedMessageTitle')).toBeNull()
    expect(mockUpdate).not.toBeCalled()
  })

  it('logs a failed revocation metadata update without failing the screen', async () => {
    const emitSpy = jest.spyOn(DeviceEventEmitter, 'emit')
    mockUpdate.mockRejectedValue(new Error('Storage failed'))
    mockGetById.mockResolvedValue(createRecord({ revocationDate: REVOCATION_DATE }))

    renderDetails('credential-exchange-id')

    await waitFor(() =>
      expect(mockLoggerError).toBeCalledWith(
        'Failed to update the credential revocation metadata',
        expect.objectContaining({ credentialId: 'credential-exchange-id' })
      )
    )
    expect(screen.getByText('CredentialDetails.CredentialRevokedMessageTitle')).toBeTruthy()
    expect(emitSpy).not.toBeCalledWith('ErrorAdded', expect.anything())
  })

  it('reports a missing credential id as error 1033', async () => {
    const emitSpy = jest.spyOn(DeviceEventEmitter, 'emit')

    renderDetails(undefined)

    await waitFor(() => expect(emitSpy).toBeCalledWith('ErrorAdded', expect.objectContaining({ code: 1033 })))
  })

  it('lets the last field scroll above the floating tab bar when opened inside the tab navigator', async () => {
    mockGetById.mockResolvedValue(createRecord())

    render(
      <BottomTabBarHeightContext.Provider value={65}>
        <CredentialDetails
          navigation={navigation as never}
          route={
            {
              key: 'CredentialDetails',
              name: 'CredentialDetails',
              params: { credentialId: 'credential-exchange-id' },
            } as never
          }
        />
      </BottomTabBarHeightContext.Provider>
    )

    expect(await screen.findByText('Diploma')).toBeTruthy()
    expect(mockRecordProps).toHaveBeenLastCalledWith(
      expect.objectContaining({ contentContainerStyle: { paddingBottom: 65 + 16 + 16 } })
    )
  })

  it('adds no bottom space when opened outside the tab navigator', async () => {
    mockGetById.mockResolvedValue(createRecord())

    renderDetails('credential-exchange-id')

    expect(await screen.findByText('Diploma')).toBeTruthy()
    expect(mockRecordProps).toHaveBeenLastCalledWith(
      expect.objectContaining({ contentContainerStyle: { paddingBottom: 0 } })
    )
  })
})
