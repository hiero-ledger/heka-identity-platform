import type { PropsWithChildren } from 'react'
import type * as React from 'react'

import { MdocRecord } from '@credo-ts/core'
import { useAgent } from '@credo-ts/react-hooks'
import { recordsAddedByType, recordsRemovedByType, recordsUpdatedByType } from '@credo-ts/react-hooks/build/recordUtils'
import { createContext, useContext, useEffect, useState } from 'react'

export { Mdoc, MdocRecord } from '@credo-ts/core'

type MdocRecordState = {
  mdocCredentialRecords: Array<MdocRecord>
  isLoading: boolean
}

const addRecord = (record: MdocRecord, state: MdocRecordState): MdocRecordState => {
  const newRecordsState = [...state.mdocCredentialRecords]
  newRecordsState.unshift(record)
  return {
    isLoading: state.isLoading,
    mdocCredentialRecords: newRecordsState,
  }
}

const updateRecord = (record: MdocRecord, state: MdocRecordState): MdocRecordState => {
  const newRecordsState = [...state.mdocCredentialRecords]
  const index = newRecordsState.findIndex((r) => r.id === record.id)
  if (index > -1) {
    newRecordsState[index] = record
  }
  return {
    isLoading: state.isLoading,
    mdocCredentialRecords: newRecordsState,
  }
}

const removeRecord = (record: MdocRecord, state: MdocRecordState): MdocRecordState => {
  const newRecordsState = state.mdocCredentialRecords.filter((r) => r.id !== record.id)
  return {
    isLoading: state.isLoading,
    mdocCredentialRecords: newRecordsState,
  }
}

const MdocRecordContext = createContext<MdocRecordState | undefined>(undefined)

export const useMdocRecords = (): MdocRecordState => {
  const mdocRecordContext = useContext(MdocRecordContext)
  if (!mdocRecordContext) {
    throw new Error('useMdocRecord must be used within a MdocRecordContextProvider')
  }

  return mdocRecordContext
}

export const useMdocRecordById = (id: string): MdocRecord | undefined => {
  const { mdocCredentialRecords } = useMdocRecords()
  return mdocCredentialRecords.find((c) => c.id === id)
}

export const MdocRecordProvider: React.FC<PropsWithChildren> = ({ children }) => {
  const { agent } = useAgent()

  const [state, setState] = useState<MdocRecordState>({
    mdocCredentialRecords: [],
    isLoading: true,
  })

  useEffect(() => {
    if (!agent) return
    agent.mdoc.getAll().then((mdocCredentialRecords) => setState({ mdocCredentialRecords, isLoading: false }))
  }, [agent])

  useEffect(() => {
    if (!state.isLoading && agent) {
      const credentialAdded$ = recordsAddedByType(agent, MdocRecord).subscribe((record) =>
        setState(addRecord(record, state))
      )

      const credentialUpdate$ = recordsUpdatedByType(agent, MdocRecord).subscribe((record) =>
        setState(updateRecord(record, state))
      )

      const credentialRemove$ = recordsRemovedByType(agent, MdocRecord).subscribe((record) =>
        setState(removeRecord(record, state))
      )

      return () => {
        credentialAdded$.unsubscribe()
        credentialUpdate$.unsubscribe()
        credentialRemove$.unsubscribe()
      }
    }
  }, [state, agent])

  return <MdocRecordContext.Provider value={state}>{children}</MdocRecordContext.Provider>
}
