import {
  BasicMessageRecord,
  ConnectionRecord,
  ConnectionType,
  CredentialExchangeRecord,
  DidExchangeState,
  ProofExchangeRecord,
} from '@credo-ts/core'
import { useAgent, useConnections } from '@credo-ts/react-hooks'
import { BifoldAgent, BifoldError, EventTypes, TOKENS, useServices, useStore } from '@hyperledger/aries-bifold-core'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { DeviceEventEmitter } from 'react-native'

interface ConnectionWithMessages {
  conn: ConnectionRecord
  msgs: (BasicMessageRecord | CredentialExchangeRecord | ProofExchangeRecord)[]
}

interface ConnectionWithLatestMessage {
  conn: ConnectionRecord
  latestMsg: BasicMessageRecord | CredentialExchangeRecord | ProofExchangeRecord
}

async function sortContactsByLastMessage(contacts: ConnectionRecord[], agent: BifoldAgent) {
  const contactsWithMessages = await Promise.all<ConnectionWithMessages>(
    contacts.map(
      async (conn: ConnectionRecord): Promise<ConnectionWithMessages> => ({
        conn,
        msgs: [
          ...(await agent.basicMessages.findAllByQuery({ connectionId: conn.id })),
          ...(await agent.proofs.findAllByQuery({ connectionId: conn.id })),
          ...(await agent.credentials.findAllByQuery({ connectionId: conn.id })),
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
        { createdAt: pair.conn.createdAt } as BasicMessageRecord | CredentialExchangeRecord | ProofExchangeRecord
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
  contacts: ConnectionRecord[]
  isLoading: boolean
}

export const useContacts = (): ContactsState => {
  const { t } = useTranslation()

  const [store] = useStore()

  const { agent } = useAgent()

  const [{ contactHideList }] = useServices([TOKENS.CONFIG])

  const { records } = useConnections()
  const [contacts, setContacts] = useState<ConnectionRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!agent?.wallet.isInitialized || !records.length) return

    setIsLoading(true)
    sortContactsByLastMessage(records, agent)
      .then((orderedContacts) => {
        // if developer mode is disabled, filter out mediator connections and connections in the hide list
        if (!store.preferences.developerModeEnabled) {
          orderedContacts = orderedContacts.filter((r) => {
            return (
              !r.connectionTypes.includes(ConnectionType.Mediator) &&
              !contactHideList?.includes((r.theirLabel || r.alias) ?? '') &&
              r.state === DidExchangeState.Completed
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
