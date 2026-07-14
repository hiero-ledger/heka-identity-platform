import { useConnectionById } from '@bifold/react-hooks'
import { DidCommCredentialExchangeRecord, DidCommProofExchangeRecord } from '@credo-ts/didcomm'
import React from 'react'
import { ViewStyle } from 'react-native'

import { ExternalPartyDisplay } from './ExternalPartyDisplay'

interface Props {
  record: DidCommCredentialExchangeRecord | DidCommProofExchangeRecord
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
