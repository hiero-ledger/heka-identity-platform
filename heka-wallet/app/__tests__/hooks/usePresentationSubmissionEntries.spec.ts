import { act, renderHook } from '@testing-library/react-native'

import {
  OpenIdPresentationSubmission,
  PresentationSubmissionEntry,
  PresentationSubmissionType,
} from '../../src/credentials/types/presentation'
import { usePresentationSubmissionEntries } from '../../src/hooks/usePresentationSubmissionEntries'

jest.mock('@bifold/oca/build/legacy', () => ({
  Attribute: class {
    constructor(params: object) {
      Object.assign(this, params)
    }
  },
}))

const option = (credentialId: string) =>
  ({
    credential: { id: credentialId },
    requestedAttributes: [],
  }) as unknown as PresentationSubmissionEntry['submissionOptions'][number]

const createSubmission = (): OpenIdPresentationSubmission => {
  const first = option('credential-1')
  const second = option('credential-2')
  return {
    type: PresentationSubmissionType.OpenId4VP,
    name: 'Request',
    areAllSatisfied: true,
    submissionParams: {} as OpenIdPresentationSubmission['submissionParams'],
    entries: [
      {
        inputDescriptorId: 'id-card',
        name: 'ID',
        isSatisfied: true,
        selectedOption: first,
        submissionOptions: [first, second],
      },
    ],
  }
}

describe('usePresentationSubmissionEntries', () => {
  it('switches the credential without mutating the submission entries', () => {
    const submission = createSubmission()
    const originalEntry = submission.entries[0]
    const originalOption = originalEntry.selectedOption
    const setSubmissionEntries = jest.fn()

    const { result } = renderHook(() => usePresentationSubmissionEntries(submission, setSubmissionEntries))
    act(() => result.current.changeSelectedCredential('id-card', 'credential-2'))

    expect(originalEntry.selectedOption).toBe(originalOption)
    expect(submission.entries[0]).toBe(originalEntry)
    const [updatedEntries] = setSubmissionEntries.mock.calls[0] as [PresentationSubmissionEntry[]]
    expect(updatedEntries[0]).not.toBe(originalEntry)
    expect(updatedEntries[0].selectedOption?.credential.id).toBe('credential-2')
  })

  it('throws for an unknown credential option', () => {
    const submission = createSubmission()
    const { result } = renderHook(() => usePresentationSubmissionEntries(submission, jest.fn()))

    expect(() => result.current.changeSelectedCredential('id-card', 'unknown')).toThrow(
      'Selected credential option is not found'
    )
  })
})
