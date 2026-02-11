import { HekaTheme, useHekaTheme } from '@heka-wallet/shared'
import { toImageSource } from '@hyperledger/aries-bifold-core/App/utils/credential'
import React, { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Image, StyleSheet, Text, TouchableOpacity } from 'react-native'

import { Role } from './types'

const useStyles = ({ TextTheme, FontWeights, Spacing, BorderRadius, ColorPallet }: HekaTheme) =>
  StyleSheet.create({
    container: {
      gap: 8,
      alignItems: 'flex-start',
    },
    type: {
      fontFamily: 'Inter',
      fontSize: 20,
      lineHeight: 28,
      fontWeight: FontWeights.bold,
    },
    state: {
      ...TextTheme.labelSubtitle,
      borderRadius: BorderRadius.small,
      paddingVertical: Spacing.xxxs,
      paddingHorizontal: Spacing.xs,
      backgroundColor: ColorPallet.semantic.success,
      color: ColorPallet.grayscale.white,
    },
    image: {
      resizeMode: 'cover',
      minHeight: 160,
      minWidth: 160,
      borderRadius: BorderRadius.small,
    },
  })

export enum EventTypes {
  CredentialOffer = 'CredentialOffer',
  Credential = 'Credential',
  PresentationRequest = 'PresentationRequest',
  Presentation = 'Presentation',
}

export enum EventStates {
  Received = 'Received',
  Requested = 'Requested',
  Sent = 'Shared',
  Accepted = 'Accepted',
  Declined = 'Declined',
}

export interface EventDetails {
  role: Role
  type: string
  state?: string
  image?: string
  styles?: EventStyles
}

export interface EventStyles {
  backgroundColor?: string
  fontColor?: string
}

interface ChatEventProps {
  event: EventDetails
  onPress?: () => void
}

export const ChatEvent: React.FC<ChatEventProps> = ({ event, onPress }) => {
  const { t } = useTranslation()

  const theme = useHekaTheme()
  const styles = useStyles(theme)

  const typeLabel = useMemo(() => {
    switch (event.type) {
      case EventTypes.CredentialOffer:
        return t('Notifications.CredentialOffer')
      case EventTypes.Credential:
        return t('Notifications.Credential')
      case EventTypes.PresentationRequest:
        return t('Notifications.ProofRequest')
      case EventTypes.Presentation:
        return t('Notifications.ProofPresentation')
      default:
        return ''
    }
  }, [event.type, t])

  const stateLabel = useMemo(() => {
    switch (event.state) {
      case EventStates.Received:
        return t('Notifications.Received')
      case EventStates.Requested:
        return t('Notifications.Requested')
      case EventStates.Sent:
        return t('Notifications.Sent')
      case EventStates.Accepted:
        return t('Notifications.Accepted')
      case EventStates.Declined:
        return t('Notifications.Declined')
      default:
        return ''
    }
  }, [event.state, t])

  const statusBackgroundColor = useMemo(() => {
    switch (event.state) {
      case EventStates.Received:
      case EventStates.Requested:
        return theme.ColorPallet.brand.highlight
      case EventStates.Sent:
      case EventStates.Accepted:
        return theme.ColorPallet.semantic.success
      case EventStates.Declined:
        return theme.ColorPallet.notification.errorText
      default:
        return theme.ColorPallet.notification.error
    }
  }, [event.state, theme])

  return (
    <TouchableOpacity style={styles.container} activeOpacity={0.8} onPress={onPress}>
      <Text
        style={[
          event.role === Role.me ? theme.ChatTheme.rightText : theme.ChatTheme.leftText,
          styles.type,
          event.styles?.fontColor ? { color: event.styles.fontColor } : {},
        ]}
      >
        {typeLabel}
      </Text>
      {event.state && <Text style={[styles.state, { backgroundColor: statusBackgroundColor }]}>{stateLabel}</Text>}
      {event.image && <Image style={styles.image} source={toImageSource(event.image)} />}
    </TouchableOpacity>
  )
}
