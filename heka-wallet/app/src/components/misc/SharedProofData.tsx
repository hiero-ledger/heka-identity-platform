import { DidCommProofExchangeRecord } from '@credo-ts/didcomm'
import { HekaTheme, useHekaTheme } from '@heka-wallet/shared'
import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FlatList, StyleSheet, Text, View } from 'react-native'

import { preparePresentationData, PresentationDetails, useCredentials } from '../../credentials'
import { useHekaAgent } from '../../utils/agent'
import { formatError } from '../../utils/error'
import { CredentialCard, SectionCard } from '../cards'
import { Loader } from '../views/LoadingView'

import { Record } from './Record'

const useStyles = ({ Spacing, TextTheme, ColorPalette }: HekaTheme) => {
  return StyleSheet.create({
    loadError: {
      ...TextTheme.normal,
      color: ColorPalette.semantic.error,
    },
    container: {
      flexGrow: 1,
    },
    loaderContainer: {
      flexGrow: 1,
      height: 200,
      marginTop: 80,
    },
    credentialsContainer: {
      gap: Spacing.md,
    },
  })
}

interface SharedProofDataProps {
  record: DidCommProofExchangeRecord
}

const SharedProofData: React.FC<SharedProofDataProps> = ({ record }) => {
  const { agent } = useHekaAgent()
  if (!agent) {
    throw new Error('Unable to fetch agent from Credo')
  }

  const { t } = useTranslation()

  const theme = useHekaTheme()
  const styles = useStyles(theme)

  const [loading, setLoading] = useState<boolean>(true)
  const [presentationData, setPresentationData] = useState<PresentationDetails[] | undefined>(undefined)

  const { credentials, isLoading: isCredentialsLoading, error: credentialsError } = useCredentials()

  useEffect(() => {
    if (isCredentialsLoading) return
    if (credentialsError) {
      setLoading(false)
      return
    }

    preparePresentationData(record, agent, credentials)
      .then((data) => setPresentationData(data))
      .catch((error: unknown) =>
        agent.config.logger.error('Failed to prepare shared proof data', {
          proofExchangeRecordId: record.id,
          error: formatError(error),
        })
      )
      .finally(() => setLoading(false))
  }, [record, credentials, isCredentialsLoading, credentialsError, agent])

  if (loading) {
    return (
      <View style={styles.loaderContainer}>
        <Loader />
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <SectionCard title={t('Proof.SharedInformation')}>
        {credentialsError ? <Text style={styles.loadError}>{t('Credentials.LoadFailed')}</Text> : null}
        <FlatList
          data={presentationData}
          contentContainerStyle={styles.credentialsContainer}
          scrollEnabled={false}
          renderItem={({ item: entry }) => (
            <Record
              fields={entry.shared}
              header={() => (
                <CredentialCard
                  credentialDisplay={entry.credential?.display}
                  requestedCredentialName={entry.credential?.display.name}
                />
              )}
            />
          )}
        />
      </SectionCard>
    </View>
  )
}

export default SharedProofData
