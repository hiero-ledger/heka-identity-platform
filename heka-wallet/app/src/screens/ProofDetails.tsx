import type { StackScreenProps } from '@react-navigation/stack'

import { ProofExchangeRecord, ProofState } from '@credo-ts/core'
import { useAgent, useConnectionById, useProofById } from '@credo-ts/react-hooks'
import { HekaTheme, useHekaTheme } from '@heka-wallet/shared'
import { Screens, useStore } from '@hyperledger/aries-bifold-core'
import { ProofRequestsStackParams } from '@hyperledger/aries-bifold-core/App/types/navigators'
import { getConnectionName } from '@hyperledger/aries-bifold-core/App/utils/helpers'
import { ProofCustomMetadata, ProofMetadata, markProofAsViewed } from '@hyperledger/aries-bifold-verifier'
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
  record: ProofExchangeRecord
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
        {record.state === ProofState.Abandoned && (
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
        agent?.proofs.deleteById(recordId)
      }
      if ((proofRecord?.metadata.get(ProofMetadata.customMetadata) as ProofCustomMetadata).delete_conn_after_seen) {
        agent?.connections.deleteById(proofRecord?.connectionId ?? '')
      }
    }
  }, [
    agent?.connections,
    agent?.proofs,
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
        {proofRecord.state === ProofState.Done ? (
          <VerifiedProof record={proofRecord} />
        ) : (
          <UnverifiedProof record={proofRecord} />
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

export default ProofDetails
