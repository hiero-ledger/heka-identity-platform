import { HekaTheme, useHekaTheme } from '@heka-wallet/shared'
import { ButtonLocation, DispatchAction, HeaderButton, useStore } from '@hyperledger/aries-bifold-core'
import { SettingStackParams } from '@hyperledger/aries-bifold-core/App/types/navigators'
import { SettingIcon } from '@hyperledger/aries-bifold-core/App/types/settings'
import { StackScreenProps } from '@react-navigation/stack'
import React, { useCallback, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ActivityIndicator,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
  ViewStyle,
} from 'react-native'
import { getBuildNumber, getVersion } from 'react-native-device-info'
import { SafeAreaView } from 'react-native-safe-area-context'
import MaterialIcon from 'react-native-vector-icons/MaterialIcons'

import HieroLogo from '../assets/hiero_logo.svg'
import { AsyncFn, GenericFn } from '../types/fn'
import { LoadingProps } from '../types/settings'
import { useWalletSettings } from '../utils/useWalletSettings'

const TOUCH_COUNT_TO_ENABLE_DEV_MODE = 9

const useStyles = ({ SettingsTheme, Spacing, BorderRadius, TextTheme }: HekaTheme) =>
  StyleSheet.create({
    sectionListContainer: {
      // Workaround to mitigate section separator offset
      // TODO: Find a better solution
      paddingBottom: 100 - Spacing.xs,
    },
    sectionItem: {
      backgroundColor: SettingsTheme.groupBackground,
      paddingHorizontal: Spacing.xl,
      paddingTop: Spacing.md,
    },
    sectionHeader: {
      borderTopLeftRadius: BorderRadius.big,
      borderTopRightRadius: BorderRadius.big,
      flexDirection: 'row',
      alignItems: 'center',
      paddingBottom: 0,
      // Workaround to mitigate section separator offset
      // TODO: Find a better solution
      marginBottom: -Spacing.xs,
    },
    sectionSeparator: {
      marginBottom: Spacing.xs,
    },
    sectionRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      flexGrow: 1,
    },
    sectionRowIconContainer: {
      flexDirection: 'row',
      gap: Spacing.xxxs,
    },
    headerContainer: {
      marginVertical: Spacing.xs,
    },
    headerSection: {
      width: '100%',
      borderRadius: BorderRadius.big,
    },
    headerBottom: {
      paddingVertical: Spacing.sm,
    },
    lastSectionItem: {
      paddingBottom: Spacing.md,
      borderBottomLeftRadius: BorderRadius.big,
      borderBottomRightRadius: BorderRadius.big,
    },
    versionText: {
      ...TextTheme.label,
      paddingHorizontal: Spacing.xl,
    },
  })

type Props = StackScreenProps<SettingStackParams>

export const Settings: React.FC<Props> = () => {
  const { t } = useTranslation()

  const theme = useHekaTheme()
  const styles = useStyles(theme)
  const { BorderRadius, TextTheme, Assets } = theme

  const [store, dispatch] = useStore()
  const developerOptionCount = useRef(0)

  const incrementDeveloperMenuCounter = () => {
    if (developerOptionCount.current >= TOUCH_COUNT_TO_ENABLE_DEV_MODE) {
      developerOptionCount.current = 0
      dispatch({
        type: DispatchAction.ENABLE_DEVELOPER_MODE,
        payload: [true],
      })

      return
    }

    developerOptionCount.current = developerOptionCount.current + 1
  }

  const settingSections = useWalletSettings()

  return (
    <SafeAreaView edges={['bottom', 'left', 'right']}>
      <SectionList
        contentContainerStyle={styles.sectionListContainer}
        renderItem={({ item: { title, value, accessibilityLabel, testID, onPress, loadingProps }, section, index }) => {
          const isLastSectionItem = index === section.data.length - 1
          return (
            <SettingSectionRow
              title={title}
              value={value}
              containerStyle={isLastSectionItem ? styles.lastSectionItem : undefined}
              accessibilityLabel={accessibilityLabel}
              testID={testID ?? 'NoTestIdFound'}
              onPress={onPress}
              loadingProps={loadingProps}
            />
          )
        }}
        renderSectionHeader={({
          section: {
            header: { title, iconRight, titleTestID },
          },
        }) => <SettingSectionHeader iconRight={iconRight} title={title} titleTestID={titleTestID} />}
        SectionSeparatorComponent={() => <View style={styles.sectionSeparator}></View>}
        ListHeaderComponent={() => (
          <View style={styles.headerContainer}>
            <TouchableWithoutFeedback
              onPress={incrementDeveloperMenuCounter}
              disabled={store.preferences.developerModeEnabled}
            >
              <View style={{ ...styles.sectionItem, borderRadius: BorderRadius.big }}>
                <Text style={{ ...TextTheme.label }}>{t('Settings.PoweredBy')}</Text>
                <View style={{ alignSelf: 'center', flexDirection: 'row' }}>
                  <Assets.svg.logo width={150} height={75} />
                  <HieroLogo style={{ marginLeft: 20 }} width={150} height={75} />
                </View>
                <View style={styles.headerBottom} />
              </View>
            </TouchableWithoutFeedback>
          </View>
        )}
        ListFooterComponent={() => (
          <Text style={styles.versionText}>
            {`${t('Settings.Version')} ${getVersion()} ${t('Settings.Build')} ${getBuildNumber()}`}
          </Text>
        )}
        sections={settingSections}
        stickySectionHeadersEnabled={false}
      />
    </SafeAreaView>
  )
}

interface SettingSectionHeaderProps {
  iconRight?: SettingIcon
  title: string
  titleTestID?: string
}

const SettingSectionHeader: React.FC<SettingSectionHeaderProps> = ({ iconRight, title, titleTestID }) => {
  const theme = useHekaTheme()
  const styles = useStyles(theme)
  const { TextTheme } = theme

  const [store] = useStore()

  return store.preferences.useConnectionInviterCapability ? (
    <View
      style={{
        ...styles.sectionItem,
        ...styles.sectionHeader,
        justifyContent: iconRight ? 'space-between' : undefined,
      }}
    >
      <View style={{ display: 'flex', flexDirection: 'row', alignItems: 'center' }}>
        {title && (
          <Text
            testID={titleTestID}
            numberOfLines={1}
            accessibilityRole={'header'}
            style={[TextTheme.label, { flexShrink: 1 }]}
          >
            {title}
          </Text>
        )}
      </View>
      {iconRight && (
        <HeaderButton
          buttonLocation={ButtonLocation.Right}
          accessibilityLabel={iconRight.accessibilityLabel!}
          testID={iconRight.testID!}
          onPress={iconRight.action!}
          icon={'pencil'}
          iconTintColor={TextTheme.headingThree.color}
        />
      )}
    </View>
  ) : (
    <View style={[styles.sectionItem, styles.sectionHeader]}>
      {title && (
        <Text accessibilityRole={'header'} style={TextTheme.label}>
          {title}
        </Text>
      )}
    </View>
  )
}

interface SettingSectionRowProps {
  title: string
  value?: string
  containerStyle?: ViewStyle
  accessibilityLabel?: string
  testID?: string
  onPress?: GenericFn | AsyncFn
  loadingProps?: LoadingProps
}

const SettingSectionRow: React.FC<SettingSectionRowProps> = ({
  title,
  value,
  containerStyle,
  accessibilityLabel,
  testID,
  onPress,
  loadingProps,
}) => {
  const theme = useHekaTheme()
  const styles = useStyles(theme)
  const { TextTheme, ColorPallet, IconSizes } = theme

  const [isActionPending, setIsActionPending] = useState(false)
  const executeAction = useCallback(async () => {
    if (!onPress) return
    if (!loadingProps) {
      onPress()
      return
    }
    setIsActionPending(true)
    try {
      await onPress()
    } finally {
      setIsActionPending(false)
    }
  }, [loadingProps, onPress])

  return (
    <ScrollView horizontal style={{ ...styles.sectionItem, ...containerStyle }} contentContainerStyle={{ flexGrow: 1 }}>
      <TouchableOpacity
        accessible={true}
        accessibilityLabel={accessibilityLabel}
        testID={testID}
        style={styles.sectionRow}
        onPress={executeAction}
        disabled={isActionPending}
      >
        <Text style={TextTheme.normal}>{isActionPending ? loadingProps?.title : title}</Text>
        <View style={styles.sectionRowIconContainer}>
          <Text style={TextTheme.normal}>{value}</Text>
          {!isActionPending && (
            <MaterialIcon name={'chevron-right'} color={ColorPallet.brand.label} size={IconSizes.medium} />
          )}
          {isActionPending && <ActivityIndicator color={ColorPallet.brand.label} size={IconSizes.medium} />}
        </View>
      </TouchableOpacity>
    </ScrollView>
  )
}
