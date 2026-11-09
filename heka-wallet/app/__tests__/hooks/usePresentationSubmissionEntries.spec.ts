import { Attribute } from '@bifold/oca/build/legacy'
import { act, renderHook } from '@testing-library/react-native'

import {
  AnoncredsPresentationSubmission,
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

type SubmissionOption = PresentationSubmissionEntry['submissionOptions'][number]

const option = (credentialId: string, requestedAttributes: object[] = []) =>
  ({
    credential: { id: credentialId },
    requestedAttributes,
  }) as unknown as SubmissionOption

const entry = (
  inputDescriptorId: string,
  submissionOptions: SubmissionOption[],
  selectedOption: SubmissionOption | null = null
): PresentationSubmissionEntry => ({
  inputDescriptorId,
  name: inputDescriptorId,
  isSatisfied: !!selectedOption,
  selectedOption,
  submissionOptions,
})

const createOpenIdSubmission = (
  areAllSatisfied: boolean,
  entries: PresentationSubmissionEntry[]
): OpenIdPresentationSubmission => ({
  type: PresentationSubmissionType.OpenId4VP,
  name: 'Request',
  areAllSatisfied,
  submissionParams: {} as OpenIdPresentationSubmission['submissionParams'],
  entries,
})

const createAnoncredsSubmission = (
  entries: PresentationSubmissionEntry[],
  requestedAttributes: Record<string, string[]>
): AnoncredsPresentationSubmission =>
  ({
    type: PresentationSubmissionType.ProofExchange,
    name: 'Request',
    areAllSatisfied: false,
    entries,
    entriesWithAnoncredsMatches: new Map(
      Object.entries(requestedAttributes).map(([id, names]) => [
        id,
        { groupNames: { attributes: [], predicates: [] }, matches: [], requestedAttributes: new Set(names) },
      ])
    ),
  }) as unknown as AnoncredsPresentationSubmission

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

  it('throws for an unknown entry and does not update the entries', () => {
    const setSubmissionEntries = jest.fn()
    const { result } = renderHook(() => usePresentationSubmissionEntries(createSubmission(), setSubmissionEntries))

    expect(() => result.current.changeSelectedCredential('unknown', 'credential-2')).toThrow(
      'Presentation submission entry is not found'
    )
    expect(setSubmissionEntries).not.toBeCalled()
  })

  it('shows only the entries with a selected credential when all are satisfied', () => {
    const name = { name: 'name', value: 'Alice' }
    const selected = option('credential-1', [name])
    const submission = createOpenIdSubmission(true, [
      entry('id-card', [selected], selected),
      entry('diploma', [option('credential-2')]),
    ])

    const { result } = renderHook(() => usePresentationSubmissionEntries(submission, jest.fn()))

    expect(result.current.entriesToDisplay).toEqual([
      { entry: submission.entries[0], attributes: [name], hasAltCredentials: false },
    ])
  })

  it('shows only the entries without a selected credential when some are not satisfied', () => {
    const selected = option('credential-1')
    const submission = createOpenIdSubmission(false, [entry('id-card', [selected], selected), entry('diploma', [])])

    const { result } = renderHook(() => usePresentationSubmissionEntries(submission, jest.fn()))

    expect(result.current.entriesToDisplay.map((item) => item.entry.inputDescriptorId)).toEqual(['diploma'])
    // An OpenID entry has no AnonCreds names to fall back on
    expect(result.current.entriesToDisplay[0].attributes).toEqual([])
  })

  it('marks an entry with more than one credential as having alternatives', () => {
    const first = option('credential-1')
    const submission = createOpenIdSubmission(true, [
      entry('id-card', [first, option('credential-2')], first),
      entry('diploma', [option('credential-3')], option('credential-3')),
    ])

    const { result } = renderHook(() => usePresentationSubmissionEntries(submission, jest.fn()))

    expect(result.current.entriesToDisplay.map((item) => item.hasAltCredentials)).toEqual([true, false])
  })

  it('shows the requested AnonCreds attribute names with empty values for an unsatisfied entry', () => {
    const submission = createAnoncredsSubmission([entry('id-card', [])], { 'id-card': ['name', 'birthdate'] })

    const { result } = renderHook(() => usePresentationSubmissionEntries(submission, jest.fn()))

    const { attributes } = result.current.entriesToDisplay[0]
    expect(attributes).toEqual([
      expect.objectContaining({ name: 'name', value: '' }),
      expect.objectContaining({ name: 'birthdate', value: '' }),
    ])
    attributes.forEach((attribute) => expect(attribute).toBeInstanceOf(Attribute))
  })

  it('shows no attributes for an unsatisfied AnonCreds entry without requested names', () => {
    const submission = createAnoncredsSubmission([entry('id-card', [])], { other: ['name'] })

    const { result } = renderHook(() => usePresentationSubmissionEntries(submission, jest.fn()))

    expect(result.current.entriesToDisplay[0].attributes).toEqual([])
  })
})
