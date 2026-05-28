import { BifoldAgent, BifoldError, EventTypes, TOKENS, useServices, useStore } from '@bifold/core'
import { useConnections, useAgent } from '@bifold/react-hooks'
import {
  DidCommBasicMessageRecord,
  DidCommConnectionRecord,
  DidCommConnectionType,
  DidCommCredentialExchangeRecord,
  DidCommDidExchangeState,
  DidCommProofExchangeRecord,
} from '@credo-ts/didcomm'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { DeviceEventEmitter } from 'react-native'

interface ConnectionWithMessages {
  conn: DidCommConnectionRecord
  msgs: (DidCommBasicMessageRecord | DidCommCredentialExchangeRecord | DidCommProofExchangeRecord)[]
}

interface ConnectionWithLatestMessage {
  conn: DidCommConnectionRecord
  latestMsg: DidCommBasicMessageRecord | DidCommCredentialExchangeRecord | DidCommProofExchangeRecord
}

async function sortContactsByLastMessage(contacts: DidCommConnectionRecord[], agent: BifoldAgent) {
  const contactsWithMessages = await Promise.all<ConnectionWithMessages>(
    contacts.map(
      async (conn: DidCommConnectionRecord): Promise<ConnectionWithMessages> => ({
        conn,
        msgs: [
          ...(await agent.didcomm.basicMessages.findAllByQuery({ connectionId: conn.id })),
          ...(await agent.didcomm.proofs.findAllByQuery({ connectionId: conn.id })),
          ...(await agent.didcomm.credentials.findAllByQuery({ connectionId: conn.id })),
        ],
      })
    )
  )

  const connectionsWithLatestMessage: ConnectionWithLatestMessage[] = contactsWithMessages.map((pair) => {
    return {
      conn: pair.conn,
      latestMsg: pair.msgs.reduce(
        (acc, cur) => {
          const accDate = acc.updatedAt || acc.createdAt
          const curDate = cur.updatedAt || cur.createdAt
          return accDate > curDate ? acc : cur
        },
        // Initial value if no messages exist for this connection is a placeholder with the date the connection was created
        { createdAt: pair.conn.createdAt } as
          | DidCommBasicMessageRecord
          | DidCommCredentialExchangeRecord
          | DidCommProofExchangeRecord
      ),
    }
  })

  return connectionsWithLatestMessage
    .sort(
      (a, b) =>
        new Date(b.latestMsg.updatedAt || b.latestMsg.createdAt).valueOf() -
        new Date(a.latestMsg.updatedAt || a.latestMsg.createdAt).valueOf()
    )
    .map((pair) => pair.conn)
}

interface ContactsState {
  contacts: DidCommConnectionRecord[]
  isLoading: boolean
}

export const useContacts = (): ContactsState => {
  const { t } = useTranslation()

  const [store] = useStore()

  const { agent } = useAgent<BifoldAgent>()

  const [{ contactHideList }] = useServices([TOKENS.CONFIG])

  const { records } = useConnections()
  const [contacts, setContacts] = useState<DidCommConnectionRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!agent?.isInitialized || !records.length) return

    setIsLoading(true)
    sortContactsByLastMessage(records, agent)
      .then((orderedContacts) => {
        // if developer mode is disabled, filter out mediator connections and connections in the hide list
        if (!store.preferences.developerModeEnabled) {
          orderedContacts = orderedContacts.filter((r) => {
            return (
              !r.connectionTypes.includes(DidCommConnectionType.Mediator) &&
              !contactHideList?.includes((r.theirLabel || r.alias) ?? '') &&
              r.state === DidCommDidExchangeState.Completed
            )
          })
        }
        setContacts(orderedContacts)
      })
      .catch((err) => {
        agent?.config.logger.error('Error fetching contacts:', err)
        const error = new BifoldError(
          t('Error.Title1046'),
          t('Error.Message1046'),
          (err as Error)?.message ?? err,
          1046
        )
        DeviceEventEmitter.emit(EventTypes.ERROR_ADDED, error)
      })
      .finally(() => setIsLoading(false))
  }, [t, agent, records, store.preferences.developerModeEnabled, contactHideList])

  return { contacts, isLoading }
}
