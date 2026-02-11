import { KeplrStack } from '@heka-wallet/keplr'
import { BootstrapIcon, HekaTheme, useHekaTheme } from '@heka-wallet/shared'
import {
  Screens as BifoldScreens,
  Stacks as BifoldStacks,
  TabStacks as BifoldTabStacks,
  TOKENS,
  useContainer,
} from '@hyperledger/aries-bifold-core'
import { useNetwork } from '@hyperledger/aries-bifold-core/App/contexts/network'
import SettingStack from '@hyperledger/aries-bifold-core/App/navigators/SettingStack'
import { TabStackParams as BifoldTabStackParams } from '@hyperledger/aries-bifold-core/App/types/navigators'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import React, { ReactNode, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { isTablet } from 'react-native-device-info'
import { OrientationType, useOrientationChange } from 'react-native-orientation-locker'
import { SafeAreaView } from 'react-native-safe-area-context'
import IonIcon from 'react-native-vector-icons/Ionicons'
import MaterialCommunityIcon from 'react-native-vector-icons/MaterialCommunityIcons'

import { isKeplrIntegrationEnabled } from '../config'

import { TabStackParams, TabStacks } from './types'

const useStyles = ({ TextTheme, ColorPallet }: HekaTheme) =>
  StyleSheet.create({
    notificationsBadgeText: {
      ...TextTheme.labelText,
      color: ColorPallet.grayscale.white,
    },
  })

export const TabStack: React.FC = () => {
  const { t } = useTranslation()

  const theme = useHekaTheme()
  const styles = useStyles(theme)

  const { ColorPallet, TabTheme, IconSizes } = theme

  const container = useContainer()
  const HomeStack = container.resolve(TOKENS.STACK_HOME)
  const { useNotifications } = container.resolve(TOKENS.NOTIFICATIONS)

  const { assertConnectedNetwork } = useNetwork()

  const notifications = useNotifications()
  const Tab = createBottomTabNavigator<BifoldTabStackParams & TabStackParams>()

  const [orientation, setOrientation] = useState(OrientationType.PORTRAIT)

  useOrientationChange((orientationType) => {
    setOrientation(orientationType)
  })

  const leftMarginForDevice = () => {
    if (isTablet()) {
      return orientation in [OrientationType.PORTRAIT, OrientationType['PORTRAIT-UPSIDEDOWN']] ? 130 : 170
    }
    return 0
  }

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <Tab.Navigator
        initialRouteName={BifoldTabStacks.HomeStack}
        backBehavior={'initialRoute'}
        screenOptions={{
          unmountOnBlur: true,
          tabBarHideOnKeyboard: true,
          tabBarStyle: TabTheme.tabBarStyle,
          header: () => null,
        }}
      >
        {isKeplrIntegrationEnabled ? (
          <Tab.Screen
            name={TabStacks.KeplrStack}
            component={KeplrStack}
            options={{
              tabBarIcon: ({ color, focused }) => (
                <TabBarIcon
                  iconComponent={
                    <MaterialCommunityIcon name={'wallet-outline'} color={color} size={IconSizes.medium} />
                  }
                  label={t('TabStack.Coins')}
                  focused={focused}
                />
              ),
              tabBarShowLabel: false,
              tabBarAccessibilityLabel: t('TabStack.Coins'),
            }}
          />
        ) : (
          <Tab.Screen
            name={BifoldTabStacks.ConnectStack}
            options={{
              tabBarIcon: ({ color, focused }) => (
                <TabBarIcon
                  iconComponent={<BootstrapIcon name={'qr-code-scan'} color={color} size={IconSizes.medium} />}
                  label={t('TabStack.Scan')}
                  focused={focused}
                />
              ),
              tabBarShowLabel: false,
              tabBarAccessibilityLabel: t('TabStack.Scan'),
            }}
            listeners={({ navigation }) => ({
              tabPress: (e) => {
                e.preventDefault()
                if (!assertConnectedNetwork()) {
                  return
                }
                navigation.navigate(BifoldStacks.ConnectStack, { screen: BifoldScreens.Scan })
              },
            })}
          >
            {() => <View />}
          </Tab.Screen>
        )}
        <Tab.Screen
          name={BifoldTabStacks.HomeStack}
          component={HomeStack}
          options={{
            tabBarIcon: ({ color, focused }) => (
              <TabBarIcon
                iconComponent={
                  <MaterialCommunityIcon name={'view-dashboard-outline'} color={color} size={IconSizes.medium} />
                }
                label={t('TabStack.Credentials')}
                focused={focused}
              />
            ),
            tabBarShowLabel: false,
            tabBarAccessibilityLabel: `${t('TabStack.Credentials')} (${notifications.length ?? 0})`,
            // TODO: Find a way to pass styled text here without cast to any
            tabBarBadge: notifications.length
              ? ((<Text style={styles.notificationsBadgeText}>{notifications.length}</Text>) as any)
              : null,
            tabBarBadgeStyle: {
              height: IconSizes.small,
              minWidth: IconSizes.small,
              marginLeft: leftMarginForDevice(),
              textAlign: 'center',
              backgroundColor: ColorPallet.brand.highlight,
            },
          }}
        />
        <Tab.Screen
          name={TabStacks.BifoldSettingsStack}
          component={SettingStack}
          options={{
            tabBarIcon: ({ color, focused }) => (
              <TabBarIcon
                iconComponent={<IonIcon name={'settings-outline'} color={color} size={IconSizes.medium} />}
                label={t('TabStack.Settings')}
                focused={focused}
              />
            ),
            tabBarShowLabel: false,
            tabBarAccessibilityLabel: t('TabStack.Settings'),
          }}
        />
      </Tab.Navigator>
    </SafeAreaView>
  )
}

interface TabBarIconProps {
  iconComponent: ReactNode
  label: string
  focused?: boolean
}

const TabBarIcon: React.FC<TabBarIconProps> = ({ iconComponent, label, focused }) => {
  const { fontScale } = useWindowDimensions()
  const { TabTheme, ColorPallet } = useHekaTheme()

  const showLabels = fontScale * TabTheme.tabBarTextStyle.fontSize < 18
  return (
    <View
      style={{
        ...TabTheme.tabBarContainerStyle,
        justifyContent: showLabels ? 'flex-end' : 'center',
        backgroundColor: focused ? ColorPallet.brand.primaryBackground : ColorPallet.grayscale.white,
      }}
    >
      {iconComponent}
      {showLabels && <Text style={TabTheme.tabBarTextStyle}>{label}</Text>}
    </View>
  )
}
