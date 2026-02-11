import { ProofExchangeRecord } from '@credo-ts/core'
import { useAgent } from '@credo-ts/react-hooks'
import { HekaTheme, useHekaTheme } from '@heka-wallet/shared'
import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FlatList, StyleSheet, View } from 'react-native'

import { preparePresentationData, PresentationDetails, useCredentials } from '../../credentials'
import { CredentialCard, SectionCard } from '../cards'
import { Loader } from '../views/LoadingView'

import { Record } from './Record'

const useStyles = ({ Spacing }: HekaTheme) => {
  return StyleSheet.create({
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
  record: ProofExchangeRecord
}

const SharedProofData: React.FC<SharedProofDataProps> = ({ record }) => {
  const { agent } = useAgent()
  if (!agent) {
    throw new Error('Unable to fetch agent from Credo')
  }

  const { t } = useTranslation()

  const theme = useHekaTheme()
  const styles = useStyles(theme)

  const [loading, setLoading] = useState<boolean>(true)
  const [presentationData, setPresentationData] = useState<PresentationDetails[] | undefined>(undefined)

  const { credentials } = useCredentials()

  useEffect(() => {
    if (!credentials.length) return

    preparePresentationData(record, agent, credentials)
      .then((data) => setPresentationData(data))
      .finally(() => setLoading(false))
  }, [record, credentials, agent])

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
