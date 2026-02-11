import { CredentialExchangeRecord, ProofExchangeRecord } from '@credo-ts/core'
import { useConnectionById } from '@credo-ts/react-hooks'
import React from 'react'
import { ViewStyle } from 'react-native'

import { ExternalPartyDisplay } from './ExternalPartyDisplay'

interface Props {
  record: CredentialExchangeRecord | ProofExchangeRecord
  containerStyle?: ViewStyle
  withBorder?: boolean
}

export const ExchangeRecordDisplay: React.FC<Props> = ({ record, containerStyle, withBorder = true }) => {
  const connection = useConnectionById(record.connectionId ?? '')
  const connectionLabel = connection?.alias ?? connection?.theirLabel ?? record.connectionId ?? record.id

  return (
    <ExternalPartyDisplay
      label={connectionLabel}
      logoUrl={connection?.imageUrl}
      containerStyle={containerStyle}
      withBorder={withBorder}
      interactionDate={record.updatedAt ?? record.createdAt}
    />
  )
}
