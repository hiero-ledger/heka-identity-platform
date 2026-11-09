import { DidCommProofExchangeRecord } from '@credo-ts/didcomm'
import { HekaTheme, useHekaTheme } from '@heka-wallet/shared'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { FlatList, StyleSheet, Text, View } from 'react-native'

import { usePresentationData } from '../../hooks/usePresentationData'
import { CredentialCard, SectionCard } from '../cards'
import { Loader } from '../views/LoadingView'

import { Record } from './Record'

const useStyles = ({ ColorPalette, Spacing, TextTheme }: HekaTheme) => {
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
    error: {
      ...TextTheme.normal,
      color: ColorPalette.semantic.error,
    },
  })
}

interface SharedProofDataProps {
  record: DidCommProofExchangeRecord
}

const SharedProofData: React.FC<SharedProofDataProps> = ({ record }) => {
  const { t } = useTranslation()

  const theme = useHekaTheme()
  const styles = useStyles(theme)

  const { presentationData, isLoading, error, credentialsError } = usePresentationData(record)

  if (isLoading) {
    return (
      <View style={styles.loaderContainer}>
        <Loader />
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <SectionCard title={t('Proof.SharedInformation')}>
        {!!(error || credentialsError) && (
          <Text style={styles.error}>{t(credentialsError ? 'Credentials.LoadFailed' : 'Error.Problem')}</Text>
        )}
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
