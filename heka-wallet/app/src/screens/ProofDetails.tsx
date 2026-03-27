import type { StackScreenProps } from '@react-navigation/stack'

import { getConnectionName, Screens, useStore } from '@bifold/core'
import { ProofRequestsStackParams } from '@bifold/core/src/types/navigators'
import { useAgent, useConnectionById, useProofById } from '@bifold/react-hooks'
import { ProofCustomMetadata, ProofMetadata, markProofAsViewed } from '@bifold/verifier'
import { DidCommProofExchangeRecord, DidCommProofState } from '@credo-ts/didcomm'
import { HekaTheme, useHekaTheme } from '@heka-wallet/shared'
import React, { useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { SectionCard } from '../components/cards'
import { ExternalPartyDisplay } from '../components/misc/ExternalPartyDisplay'
import SharedProofData from '../components/misc/SharedProofData'
import LoadingView from '../components/views/LoadingView'

type ProofDetailsProps = StackScreenProps<ProofRequestsStackParams, Screens.ProofDetails>

interface ProofProps {
  record: DidCommProofExchangeRecord
}

const useStyles = ({ TextTheme, Spacing }: HekaTheme) => {
  return StyleSheet.create({
    container: {
      flexGrow: 1,
    },
    header: {
      paddingHorizontal: Spacing.lg,
      paddingVertical: Spacing.xxl,
    },
    headerTitleContainer: {
      marginTop: Spacing.xxxl,
      justifyContent: 'flex-start',
      alignItems: 'center',
    },
    headerTitle: {
      ...TextTheme.headingTwo,
      fontWeight: TextTheme.normal.fontWeight,
    },
  })
}

const VerifiedProof: React.FC<ProofProps> = ({ record }) => {
  const { t } = useTranslation()

  const theme = useHekaTheme()
  const styles = useStyles(theme)

  const connection = useConnectionById(record.connectionId || '')

  const partyDetails = useMemo(() => {
    return {
      label: connection ? getConnectionName(connection, {}) : t('Connection.UnknownConnection'),
      logoUrl: connection?.imageUrl,
      interactionDate: record?.updatedAt,
    }
  }, [connection, record?.updatedAt, t])

  return (
    <View style={styles.container}>
      <SectionCard title={t('Global.Verifier')}>
        <ExternalPartyDisplay {...partyDetails} />
      </SectionCard>
      <View style={{ marginTop: 15 }}>
        <SharedProofData record={record} />
      </View>
    </View>
  )
}

const UnverifiedProof: React.FC<ProofProps> = ({ record }) => {
  const { t } = useTranslation()

  const theme = useHekaTheme()
  const styles = useStyles(theme)

  return (
    <View style={styles.header}>
      <View style={styles.headerTitleContainer}>
        {record.state === DidCommProofState.Abandoned && (
          <Text style={styles.headerTitle}>{t('ProofRequest.ProofRequestDeclined')}</Text>
        )}
        {record.isVerified === false && <Text style={styles.headerTitle}>{t('Verifier.ProofVerificationFailed')}</Text>}
      </View>
      <theme.Assets.svg.verifierRequestDeclined style={{ alignSelf: 'center', marginTop: 20 }} height={200} />
    </View>
  )
}

const ProofDetails: React.FC<ProofDetailsProps> = ({ route }) => {
  if (!route?.params) {
    throw new Error('ProofRequesting route prams were not set properly')
  }

  const { recordId } = route.params

  const [store] = useStore()

  const theme = useHekaTheme()
  const styles = useStyles(theme)

  const { agent } = useAgent()
  const proofRecord = useProofById(recordId)

  useEffect(() => {
    return () => {
      if (!store.preferences.useDataRetention) {
        agent?.didcomm.proofs.deleteById(recordId)
      }
      if ((proofRecord?.metadata.get(ProofMetadata.customMetadata) as ProofCustomMetadata).delete_conn_after_seen) {
        agent?.didcomm.connections.deleteById(proofRecord?.connectionId ?? '')
      }
    }
  }, [
    agent?.didcomm.connections,
    agent?.didcomm.proofs,
    proofRecord?.connectionId,
    proofRecord?.metadata,
    recordId,
    store.preferences.useDataRetention,
  ])

  useEffect(() => {
    if (agent && proofRecord && !proofRecord.metadata?.data?.customMetadata?.details_seen) {
      markProofAsViewed(agent, proofRecord)
    }
  }, [agent, proofRecord])

  if (!proofRecord) {
    return <LoadingView />
  }

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <ScrollView>
        {proofRecord.state === DidCommProofState.Done ? (
          <VerifiedProof record={proofRecord} />
        ) : (
          <UnverifiedProof record={proofRecord} />
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

export default ProofDetails
