import {
  Screens as BifoldScreens,
  SettingStack,
  Stacks as BifoldStacks,
  TabStacks as BifoldTabStacks,
  TOKENS,
  useContainer,
  useNetwork,
} from '@bifold/core'
import { TabStackParams as BifoldTabStackParams } from '@bifold/core/src/types/navigators'
import { KeplrStack } from '@heka-wallet/keplr'
import { BootstrapIcon, HekaTheme, useHekaTheme } from '@heka-wallet/shared'
import { BottomTabBar, BottomTabBarProps, createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import React, { ReactNode, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { isTablet } from 'react-native-device-info'
import { OrientationType, useOrientationChange } from 'react-native-orientation-locker'
import { SafeAreaView } from 'react-native-safe-area-context'
import IonIcon from 'react-native-vector-icons/Ionicons'
import MaterialCommunityIcon from 'react-native-vector-icons/MaterialCommunityIcons'

import { isKeplrIntegrationEnabled } from '../config'

import { TabStackParams, TabStacks } from './types'

const Tab = createBottomTabNavigator<BifoldTabStackParams & TabStackParams>()

const NOTIFICATION_OPTIONS = { openIDUri: '' }

// Screens are declared with HomeStack first so React Navigation focuses it on remount
// (e.g. after lockout-relogin) — `initialRouteName` alone is unreliable for a non-first tab.
// Visual tab-bar order is decoupled here and explicitly defined on the JS side to avoid Android/iOS inconsistency.
const tabBarVisualOrder: string[] = [
  isKeplrIntegrationEnabled ? TabStacks.KeplrStack : BifoldTabStacks.ConnectStack,
  BifoldTabStacks.HomeStack,
  TabStacks.BifoldSettingsStack,
]

const OrderedTabBar: React.FC<BottomTabBarProps> = (props) => {
  const { state } = props
  const orderedRoutes = useMemo(
    () => [...state.routes].sort((a, b) => tabBarVisualOrder.indexOf(a.name) - tabBarVisualOrder.indexOf(b.name)),
    [state.routes]
  )
  const focusedKey = state.routes[state.index].key
  const orderedIndex = orderedRoutes.findIndex((route) => route.key === focusedKey)

  return <BottomTabBar {...props} state={{ ...state, routes: orderedRoutes, index: orderedIndex }} />
}

const useStyles = ({ TextTheme, ColorPalette }: HekaTheme) =>
  StyleSheet.create({
    notificationsBadgeText: {
      ...TextTheme.labelText,
      color: ColorPalette.grayscale.white,
    },
  })

export const TabStack: React.FC = () => {
  const { t } = useTranslation()

  const theme = useHekaTheme()
  const styles = useStyles(theme)

  const { ColorPalette, TabTheme, IconSizes } = theme

  const container = useContainer()
  const HomeStack = container.resolve(TOKENS.STACK_HOME)
  const { useNotifications } = container.resolve(TOKENS.NOTIFICATIONS)

  const { assertNetworkConnected } = useNetwork()

  const notifications = useNotifications(NOTIFICATION_OPTIONS)

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
        tabBar={(props) => <OrderedTabBar {...props} />}
        screenOptions={{
          unmountOnBlur: true,
          tabBarHideOnKeyboard: true,
          tabBarStyle: TabTheme.tabBarStyle,
          header: () => null,
        }}
      >
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
              backgroundColor: ColorPalette.brand.highlight,
            },
          }}
        />
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
                if (!assertNetworkConnected()) {
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
  const { TabTheme, ColorPalette } = useHekaTheme()

  const showLabels = fontScale * TabTheme.tabBarTextStyle.fontSize < 18
  return (
    <View
      style={{
        ...TabTheme.tabBarContainerStyle,
        justifyContent: showLabels ? 'flex-end' : 'center',
        backgroundColor: focused ? ColorPalette.brand.primaryBackground : ColorPalette.grayscale.white,
      }}
    >
      {iconComponent}
      {showLabels && <Text style={TabTheme.tabBarTextStyle}>{label}</Text>}
    </View>
  )
}
