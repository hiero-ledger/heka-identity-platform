import { fireEvent, render, screen } from '@testing-library/react-native'
import React from 'react'

import { PresentationRequestView } from '../../src/components/views/PresentationRequestView'
import {
  AnoncredsPresentationSubmission,
  Credential,
  PresentationSubmissionEntry,
  PresentationSubmissionType,
} from '../../src/credentials'

jest.mock('@bifold/core', () => {
  const { Pressable, Text } = jest.requireActual('react-native')
  return {
    Button: ({ title, onPress, disabled }: { title: string; onPress: () => void; disabled?: boolean }) => (
      <Pressable accessibilityRole="button" onPress={onPress} disabled={disabled}>
        <Text>{title}</Text>
      </Pressable>
    ),
    ButtonType: { Primary: 'Primary', SecondaryCritical: 'SecondaryCritical' },
    formatTime: (date: Date) => `formatted ${date.toISOString()}`,
  }
})

jest.mock('@bifold/core/src/utils/credential', () => ({
  credentialTextColor: () => '#000000',
  toImageSource: jest.fn(),
}))

jest.mock('@bifold/oca/build/legacy', () => ({
  Attribute: class {
    public constructor(props: object) {
      Object.assign(this, props)
    }
  },
}))

jest.mock('@heka-wallet/shared', () => {
  const theme = {
    BorderRadius: {},
    BorderWidth: {},
    ColorPalette: { brand: {}, grayscale: {}, semantic: {} },
    HekaTextTheme: { labelMedium: {}, labelLarge: {} },
    IconSizes: {},
    Spacing: {},
    TextTheme: { bold: {}, normal: {}, labelTitle: {}, headingFour: {}, title: {} },
  }
  return { useHekaTheme: () => theme }
})

jest.mock('@react-navigation/native', () => {
  const navigation = { getParent: () => undefined }
  return { useNavigation: () => navigation }
})

jest.mock('react-i18next', () => {
  const translation = { t: (key: string) => key }
  return { useTranslation: () => translation }
})

jest.mock('react-native-vector-icons/MaterialIcons', () => () => null)

jest.mock('../../src/credentials', () => ({
  PresentationSubmissionType: {
    OpenId4VP: 'openid4vp-presentation',
    ProofExchange: 'proof-exchange-presentation',
  },
}))

jest.mock('../../src/navigators/types', () => ({ Screens: {}, Stacks: {} }))

jest.mock('../../src/components/cards', () => {
  const { View } = jest.requireActual('react-native')
  return {
    ...jest.requireActual('../../src/components/cards/CredentialCard'),
    SectionCard: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
  }
})

// Renders the card header and, per requested attribute, its name and whether it is marked as an error
jest.mock('../../src/components/misc', () => {
  const { Text, View } = jest.requireActual('react-native')
  return {
    Record: ({
      header,
      fields,
      error,
    }: {
      header: () => React.ReactElement
      fields: Array<{ name: string }>
      error?: boolean
    }) => (
      <View>
        {header()}
        {fields.map((field) => (
          <Text key={field.name}>{`${field.name}${error ? ' (error)' : ''}`}</Text>
        ))}
      </View>
    ),
  }
})

jest.mock('../../src/components/misc/ExternalPartyDisplay', () => {
  const { Text } = jest.requireActual('react-native')
  return { ExternalPartyDisplay: ({ label }: { label: string }) => <Text>{label}</Text> }
})

jest.mock('../../src/components/modals', () => ({ ProofRequestAcceptModal: () => null }))

jest.mock('../../src/components/modals/ActionWarningModal', () => {
  const { Pressable, Text } = jest.requireActual('react-native')
  return {
    __esModule: true,
    ModalUsage: { ProofRequestDecline: 5 },
    default: ({ visible, onSubmit }: { visible?: boolean; onSubmit: () => void }) =>
      visible ? (
        <Pressable accessibilityRole="button" onPress={onSubmit}>
          <Text>confirm decline</Text>
        </Pressable>
      ) : null,
  }
})

const REVOCATION_DATE = new Date('2026-11-10T10:00:00Z')

const credential = (name: string): Credential =>
  ({
    id: `${name}-id`,
    record: {},
    display: {
      name,
      issuer: { name: 'University' },
      attributes: [
        { name: 'name', value: 'Alice' },
        { name: 'degree', value: 'Bachelor' },
      ],
    },
  }) as unknown as Credential

const submission = (entry: PresentationSubmissionEntry): AnoncredsPresentationSubmission =>
  ({
    type: PresentationSubmissionType.ProofExchange,
    name: 'Proof of education',
    verifierName: 'Verifier',
    areAllSatisfied: entry.isSatisfied,
    entries: [entry],
    proofExchangeRecord: { id: 'proof-id' },
    formatKey: 'anoncreds',
    entriesWithAnoncredsMatches: new Map([
      [
        entry.inputDescriptorId,
        {
          groupNames: { attributes: ['diploma'], predicates: [] },
          matches: [],
          requestedAttributes: new Set(['name', 'degree']),
        },
      ],
    ]),
  }) as unknown as AnoncredsPresentationSubmission

const unsatisfiedEntry = (revokedCredential?: PresentationSubmissionEntry['revokedCredential']) => ({
  inputDescriptorId: 'Credential',
  name: 'Credential',
  isSatisfied: false,
  selectedOption: null,
  submissionOptions: [],
  revokedCredential,
})

function renderView(presentationSubmission: AnoncredsPresentationSubmission) {
  const onAccept = jest.fn().mockResolvedValue(undefined)
  const onDecline = jest.fn()
  render(
    <PresentationRequestView
      presentationSubmission={presentationSubmission}
      setSubmissionEntries={jest.fn()}
      onAccept={onAccept}
      onDecline={onDecline}
    />
  )
  return { onAccept, onDecline }
}

describe('PresentationRequestView', () => {
  it('names a revoked credential and explains that it cannot be shared', () => {
    const { onDecline } = renderView(
      submission(unsatisfiedEntry({ credential: credential('University Diploma'), revocationDate: REVOCATION_DATE }))
    )

    expect(screen.getByText('University Diploma')).toBeTruthy()
    expect(screen.getByTestId('CredentialRevokedBadge')).toBeTruthy()
    expect(screen.getByTestId('CredentialRevokedBanner')).toBeTruthy()
    expect(screen.getByText('ProofRequest.CredentialRevokedTitle')).toBeTruthy()
    expect(screen.getByText('ProofRequest.RevokedCredentialCannotBeShared')).toBeTruthy()
    expect(screen.getByText(`CredentialDetails.Revoked: formatted ${REVOCATION_DATE.toISOString()}`)).toBeTruthy()
    // Not the generic placeholder for a credential the wallet does not hold
    expect(screen.queryByText('Credential')).toBeNull()
    // The requested attributes still can't be shared
    expect(screen.getByText('name (error)')).toBeTruthy()
    expect(screen.getByText('degree (error)')).toBeTruthy()

    expect(screen.queryByText('Global.Share')).toBeNull()
    fireEvent.press(screen.getByText('Global.Decline'))
    fireEvent.press(screen.getByText('confirm decline'))
    expect(onDecline).toBeCalledTimes(1)
  })

  it('leaves out the revocation date when the issuer sent no notification', () => {
    renderView(submission(unsatisfiedEntry({ credential: credential('University Diploma') })))

    expect(screen.getByText('ProofRequest.RevokedCredentialCannotBeShared')).toBeTruthy()
    expect(screen.queryByTestId('RevokedDate')).toBeNull()
  })

  it('keeps the missing credential state when the wallet holds no matching credential', () => {
    const { onDecline } = renderView(submission(unsatisfiedEntry()))

    expect(screen.getByText('Credential')).toBeTruthy()
    expect(screen.queryByTestId('CredentialRevokedBadge')).toBeNull()
    expect(screen.queryByTestId('CredentialRevokedBanner')).toBeNull()
    expect(screen.getByText('name (error)')).toBeTruthy()

    expect(screen.queryByText('Global.Share')).toBeNull()
    fireEvent.press(screen.getByText('Global.Decline'))
    fireEvent.press(screen.getByText('confirm decline'))
    expect(onDecline).toBeCalledTimes(1)
  })

  it('shares a valid credential as before', () => {
    const option = {
      credential: credential('University Diploma'),
      requestedAttributes: credential('University Diploma').display.attributes,
    } as PresentationSubmissionEntry['submissionOptions'][number]
    const { onAccept } = renderView(
      submission({
        inputDescriptorId: 'cred-valid',
        name: 'Credential',
        isSatisfied: true,
        selectedOption: option,
        submissionOptions: [option],
      })
    )

    expect(screen.getByText('University Diploma')).toBeTruthy()
    expect(screen.queryByTestId('CredentialRevokedBadge')).toBeNull()
    expect(screen.queryByTestId('CredentialRevokedBanner')).toBeNull()
    expect(screen.getByText('name')).toBeTruthy()

    fireEvent.press(screen.getByText('Global.Share'))
    expect(onAccept).toBeCalledTimes(1)
  })
})
