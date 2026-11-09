import { Attribute } from '@bifold/oca/build/legacy'
import { useCallback, useMemo } from 'react'

import {
  AnoncredsPresentationSubmission,
  OpenIdPresentationSubmission,
  PresentationSubmissionEntry,
  PresentationSubmissionType,
} from '../credentials/types/presentation'

export interface SubmissionEntryToDisplay {
  entry: PresentationSubmissionEntry
  attributes: Attribute[]
  hasAltCredentials: boolean
}

interface PresentationSubmissionEntries {
  entriesToDisplay: SubmissionEntryToDisplay[]
  changeSelectedCredential: (inputDescriptorId: string, credentialId: string) => void
}

function getAttributesToDisplay(
  presentationSubmission: OpenIdPresentationSubmission | AnoncredsPresentationSubmission,
  entry: PresentationSubmissionEntry
): Attribute[] {
  if (entry.selectedOption?.requestedAttributes) return entry.selectedOption.requestedAttributes

  // An unsatisfied AnonCreds entry still shows the names of the requested attributes
  if (presentationSubmission.type === PresentationSubmissionType.ProofExchange) {
    const requestedAttributesNames = presentationSubmission.entriesWithAnoncredsMatches.get(
      entry.inputDescriptorId
    )?.requestedAttributes
    if (requestedAttributesNames) {
      return Array.from(requestedAttributesNames).map((attribute) => new Attribute({ name: attribute, value: '' }))
    }
  }

  return []
}

/**
 * Entries of a presentation request to display, and the credential switch for an entry. The switch
 * hands new entries to `setSubmissionEntries` and leaves the submission's own objects unchanged.
 */
export function usePresentationSubmissionEntries(
  presentationSubmission: OpenIdPresentationSubmission | AnoncredsPresentationSubmission,
  setSubmissionEntries: (entries: PresentationSubmissionEntry[]) => void
): PresentationSubmissionEntries {
  const changeSelectedCredential = useCallback(
    (inputDescriptorId: string, credentialId: string) => {
      const entries = presentationSubmission?.entries ?? []

      const entryToUpdate = entries.find((entry) => entry.inputDescriptorId === inputDescriptorId)
      if (!entryToUpdate) {
        throw new Error('Presentation submission entry is not found')
      }

      const selectedOption = entryToUpdate.submissionOptions.find((option) => option.credential.id === credentialId)
      if (!selectedOption) {
        throw new Error('Selected credential option is not found')
      }

      setSubmissionEntries(entries.map((entry) => (entry === entryToUpdate ? { ...entry, selectedOption } : entry)))
    },
    [presentationSubmission.entries, setSubmissionEntries]
  )

  const entriesToDisplay = useMemo(
    () =>
      presentationSubmission.entries
        .filter((entry) => (presentationSubmission.areAllSatisfied ? !!entry.selectedOption : !entry.selectedOption))
        .map((entry) => ({
          entry,
          attributes: getAttributesToDisplay(presentationSubmission, entry),
          hasAltCredentials: entry.submissionOptions.length > 1,
        })),
    [presentationSubmission]
  )

  return { entriesToDisplay, changeSelectedCredential }
}
