import { HekaTheme, useHekaTheme } from '@heka-wallet/shared'
import { BulletPoint, Button, ButtonType, GenericFn } from '@hyperledger/aries-bifold-core'
import UnorderedList from '@hyperledger/aries-bifold-core/App/components/misc/UnorderedList'
import { hitSlop } from '@hyperledger/aries-bifold-core/App/constants'
import * as React from 'react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import Collapsible from 'react-native-collapsible'
import { Dialog, Portal } from 'react-native-paper'
import { SafeAreaView } from 'react-native-safe-area-context'
import Icon from 'react-native-vector-icons/MaterialIcons'

export enum ModalUsage {
  CredentialRemove = 1,
  ContactRemove,
  ContactRemoveWithCredentials,
  CredentialOfferDecline,
  ProofRequestDecline,
  CustomNotificationDecline,
}

interface ModalProps {
  usage: ModalUsage
  onSubmit?: GenericFn
  onCancel?: GenericFn
  visible?: boolean
  description?: string
}

interface RemoveProps {
  title: string
  content: string[]
}

const useStyles = ({ ColorPallet, TextTheme, Spacing, IconSizes, BorderRadius, BorderWidth }: HekaTheme) =>
  StyleSheet.create({
    dialog: {
      backgroundColor: ColorPallet.brand.modalPrimaryBackground,
      borderRadius: Spacing.xl,
      paddingHorizontal: Spacing.lg,
    },
    headerView: {
      flexDirection: 'row',
    },
    closeIcon: {
      color: ColorPallet.brand.modalIcon,
    },
    contentContainer: {
      gap: Spacing.lg,
    },
    titleContainer: {
      paddingRight: 2 * Spacing.xxxl,
    },
    titleCaption: TextTheme.modalNormal,
    title: TextTheme.modalTitle,
    iconContainer: {
      position: 'absolute',
      top: 0,
      right: 0,
      height: IconSizes.large,
      width: IconSizes.large,
      borderRadius: BorderRadius.medium,
      backgroundColor: ColorPallet.brand.primaryBackground,
      alignItems: 'center',
      justifyContent: 'center',
    },
    bodyText: {
      ...TextTheme.modalNormal,
    },
    declineBodyText: {
      ...TextTheme.modalNormal,
      marginTop: 25,
    },
    controlsContainer: {
      marginTop: Spacing.md,
      marginBottom: Spacing.lg,
    },
    dropdownListItem: {
      paddingBottom: Spacing.xxxs,
      borderBottomColor: ColorPallet.brand.modalSecondaryBackground,
      borderBottomWidth: BorderWidth.small,
      borderRadius: BorderRadius.smaller,
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    dropdownTitle: {
      ...TextTheme.modalNormal,
      fontWeight: TextTheme.bold.fontWeight,
    },
    dropdownIcon: {
      color: TextTheme.modalNormal.color,
    },
  })

const Dropdown: React.FC<RemoveProps> = ({ title, content }) => {
  const theme = useHekaTheme()
  const styles = useStyles(theme)

  const [isCollapsed, setIsCollapsed] = useState<boolean>(true)

  return (
    <>
      <TouchableOpacity
        onPress={() => setIsCollapsed(!isCollapsed)}
        accessibilityLabel={title}
        style={styles.dropdownListItem}
      >
        <Text style={styles.dropdownTitle}>{title}</Text>
        <Icon
          name={isCollapsed ? 'expand-more' : 'expand-less'}
          size={theme.IconSizes.medium}
          color={styles.dropdownIcon.color}
        />
      </TouchableOpacity>
      <Collapsible collapsed={isCollapsed} enablePointerEvents={true}>
        <View>
          <UnorderedList unorderedListItems={content} />
        </View>
      </Collapsible>
    </>
  )
}

const ActionWarningModal: React.FC<ModalProps> = ({ usage, visible, onSubmit, onCancel }) => {
  if (!usage) {
    throw new Error('usage cannot be undefined')
  }

  const { t } = useTranslation()

  const theme = useHekaTheme()
  const styles = useStyles(theme)

  const titleForCancelButton = useMemo(() => {
    switch (usage) {
      case ModalUsage.ContactRemoveWithCredentials:
        return null
      case ModalUsage.ContactRemove:
      case ModalUsage.CredentialRemove:
        return t('Global.DontRemove')
      default:
        return t('Global.DontDecline')
    }
  }, [t, usage])

  const titleForConfirmButton = useMemo(() => {
    switch (usage) {
      case ModalUsage.ContactRemove:
        return t('ContactDetails.RemoveContact')
      case ModalUsage.ContactRemoveWithCredentials:
        return t('ContactDetails.GoToCredentials')
      case ModalUsage.CredentialRemove:
        return t('CredentialDetails.RemoveCredential')
      default:
        return t('Global.YesDecline')
    }
  }, [t, usage])

  const titleForType = useMemo(() => {
    switch (usage) {
      case ModalUsage.ContactRemove:
        return t('ContactDetails.RemoveTitle')
      case ModalUsage.CredentialRemove:
        return t('CredentialDetails.RemoveTitle')
      case ModalUsage.ContactRemoveWithCredentials:
        return t('ContactDetails.UnableToRemoveTitle')
      case ModalUsage.CredentialOfferDecline:
        return t('CredentialOffer.DeclineTitle')
      case ModalUsage.ProofRequestDecline:
        return t('ProofRequest.DeclineTitle')
      case ModalUsage.CustomNotificationDecline:
        return t('CredentialOffer.CustomOfferTitle')
      default:
        return ''
    }
  }, [t, usage])

  const contentForType = useMemo(() => {
    switch (usage) {
      case ModalUsage.ContactRemove:
        return (
          <View>
            <Text style={styles.bodyText}>{t('ContactDetails.RemoveContactMessageTop')}</Text>
            <BulletPoint text={t('ContactDetails.RemoveContactsBulletPoint1')} textStyle={styles.bodyText} />
            <BulletPoint text={t('ContactDetails.RemoveContactsBulletPoint2')} textStyle={styles.bodyText} />
            <BulletPoint text={t('ContactDetails.RemoveContactsBulletPoint3')} textStyle={styles.bodyText} />
            <BulletPoint text={t('ContactDetails.RemoveContactsBulletPoint4')} textStyle={styles.bodyText} />
            <Text style={[styles.bodyText, { marginTop: 10 }]}>{t('ContactDetails.RemoveContactMessageBottom')}</Text>
          </View>
        )
      case ModalUsage.CredentialRemove:
        return (
          <>
            <Text style={styles.titleCaption}>{t('CredentialDetails.RemoveCaption')}</Text>
            <Dropdown
              title={t('CredentialDetails.YouWillNotLose')}
              content={[t('CredentialDetails.YouWillNotLoseListItem1'), t('CredentialDetails.YouWillNotLoseListItem2')]}
            />
            <Dropdown
              title={t('CredentialDetails.HowToGetThisCredentialBack')}
              content={[t('CredentialDetails.HowToGetThisCredentialBackListItem1')]}
            />
          </>
        )
      case ModalUsage.ContactRemoveWithCredentials:
        return (
          <>
            <Text style={styles.bodyText}>{t('ContactDetails.UnableToRemoveCaption')}</Text>
          </>
        )
      case ModalUsage.CredentialOfferDecline:
        return (
          <View>
            <Text style={styles.declineBodyText}>{t('CredentialOffer.DeclineParagraph1')}</Text>
            <Text style={styles.declineBodyText}>{t('CredentialOffer.DeclineParagraph2')}</Text>
          </View>
        )
      case ModalUsage.ProofRequestDecline:
        return (
          <View>
            <Text style={styles.declineBodyText}>{t('ProofRequest.DeclineBulletPoint1')}</Text>
            <Text style={styles.declineBodyText}>{t('ProofRequest.DeclineBulletPoint2')}</Text>
            <Text style={styles.declineBodyText}>{t('ProofRequest.DeclineBulletPoint3')}</Text>
          </View>
        )
      case ModalUsage.CustomNotificationDecline:
        return (
          <View>
            <Text style={styles.declineBodyText}>{t('CredentialOffer.CustomOfferParagraph1')}</Text>
            <Text style={styles.declineBodyText}>{t('CredentialOffer.CustomOfferParagraph2')}</Text>
          </View>
        )
      default:
        return <></>
    }
  }, [styles, t, usage])

  const buttonType = useMemo(() => {
    switch (usage) {
      case ModalUsage.ContactRemoveWithCredentials:
        return ButtonType.ModalPrimary
      default:
        return ButtonType.ModalCritical
    }
  }, [usage])

  return (
    <Portal theme={{ colors: { backdrop: 'rgba(0,0,0, 0.9)' } }}>
      <Dialog visible={!!visible} style={styles.dialog} dismissable={false}>
        <SafeAreaView edges={['left', 'right', 'bottom']}>
          <ScrollView contentContainerStyle={styles.contentContainer}>
            <View style={styles.titleContainer}>
              <Text style={styles.title}>{titleForType}</Text>
            </View>
            <TouchableOpacity
              accessibilityLabel={t('Global.Close')}
              accessibilityRole={'button'}
              onPress={() => onCancel && onCancel()}
              hitSlop={hitSlop}
              style={styles.iconContainer}
            >
              <Icon name={'close'} size={theme.IconSizes.medium} color={styles.closeIcon.color} />
            </TouchableOpacity>
            {contentForType}
          </ScrollView>
          <View style={styles.controlsContainer}>
            {titleForCancelButton && (
              <Button
                title={titleForCancelButton}
                accessibilityLabel={t('Global.Cancel')}
                testID={titleForCancelButton}
                onPress={onCancel}
                buttonType={ButtonType.ModalSecondary}
              />
            )}
            <View style={{ paddingTop: 10 }}>
              <Button
                title={titleForConfirmButton}
                accessibilityLabel={titleForConfirmButton}
                testID={titleForConfirmButton}
                onPress={onSubmit}
                buttonType={buttonType}
              />
            </View>
          </View>
        </SafeAreaView>
      </Dialog>
    </Portal>
  )
}

export default ActionWarningModal
