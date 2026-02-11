import type {
  ITheme,
  IBrandColors,
  IInputs,
  IGrayscaleColors,
  IColorPallet,
  ISemanticColors,
  INotificationColors,
  ITextTheme,
  IAssets,
  ISVGAssets,
} from '@hyperledger/aries-bifold-core'
import type { MD3Theme as PaperTheme } from 'react-native-paper'

import { useTheme } from '@hyperledger/aries-bifold-core'
import {
  Assets as BifoldImageAssets,
  heavyOpacity,
  IFontAttributes,
  mediumOpacity,
} from '@hyperledger/aries-bifold-core/App/theme'
import { getDefaultHeaderHeight } from '@react-navigation/elements'
import React, { useMemo } from 'react'
import { Dimensions, StyleSheet } from 'react-native'
import { MD3LightTheme } from 'react-native-paper'
import { SvgProps } from 'react-native-svg'

import LogoFull from '../assets/logo-full.svg'
import Logo from '../assets/logo.svg'

export interface HekaTheme extends ITheme {
  Assets: Assets
  HekaTextTheme: HekaTextTheme
  ColorPallet: ColorPallet
  IconSizes: IconSizes
  Spacing: Spacing
  BorderRadius: BorderRadius
  BorderWidth: BorderWidth
  FontWeights: FontWeights
  PaperTheme: PaperTheme
}

interface SvgAssets extends ISVGAssets {
  logoFull: React.FC<SvgProps>
}

interface Assets extends IAssets {
  svg: SvgAssets
}

type FontWeight = 'normal' | 'bold' | '100' | '200' | '300' | '400' | '500' | '600' | '700' | '800' | '900'

interface FontWeights {
  light: FontWeight
  regular: FontWeight
  medium: FontWeight
  semibold: FontWeight
  bold: FontWeight
  bolder: FontWeight
}

interface FontAttributes extends IFontAttributes {
  lineHeight: number
}

interface HekaTextTheme {
  display: FontAttributes
  headlineLarge: FontAttributes
  headlineMedium: FontAttributes
  headlineSmall: FontAttributes
  subtitleMedium: FontAttributes
  subtitleSmall: FontAttributes
  bodyMedium: FontAttributes
  bodySmall: FontAttributes
  labelLarge: FontAttributes
  labelMedium: FontAttributes
  labelSmall: FontAttributes
}

interface GrayscaleColors extends IGrayscaleColors {
  black: string
  inactiveGray: string
  darkGrey: string
  mediumGrey: string
  lightGrey: string
  veryLightGrey: string
  white: string
}

interface BrandColors extends IBrandColors {
  label: string
  recordBackground: string
  brandedSecondary: string
}

interface SemanticColors extends ISemanticColors {
  successTransparent: string
  errorTransparent: string
  errorTransparentLight: string
}

interface ColorPallet extends IColorPallet {
  grayscale: GrayscaleColors
  brand: BrandColors
  semantic: SemanticColors
}

interface IconSizes {
  extraSmall: number
  small: number
  medium: number
  big: number
  large: number
  larger: number
}

interface Spacing {
  xxxxs: number
  xxxs: number
  xxs: number
  xs: number
  sm: number
  md: number
  lg: number
  xl: number
  xxl: number
  xxxl: number
}

interface BorderRadius {
  tiny: number
  extraSmall: number
  smaller: number
  small: number
  medium: number
  big: number
  bigger: number
  large: number
  round: number
}

interface BorderWidth {
  small: number
  medium: number
  large: number
}

const defaultButtonWidth = 200

const windowDimensions = Dimensions.get('window')

export const IconSizes: IconSizes = {
  extraSmall: 14,
  small: 16,
  medium: 24,
  big: 36,
  large: 48,
  larger: 64,
}

const Spacing: Spacing = {
  xxxxs: 2,
  xxxs: 4,
  xxs: 6,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  xxxl: 40,
}

const BorderRadius: BorderRadius = {
  tiny: 2,
  extraSmall: 4,
  smaller: 6,
  small: 8,
  medium: 12,
  big: 16,
  bigger: 24,
  large: 32,
  round: 50,
}

const BorderWidth: BorderWidth = {
  small: 1,
  medium: 2,
  large: 6,
}

const GrayscaleColors: GrayscaleColors = {
  black: '#000000',
  inactiveGray: '#757575',
  darkGrey: '#313132',
  mediumGrey: '#606060',
  lightGrey: '#D3D3D3',
  veryLightGrey: '#F2F2F2',
  white: '#FFFFFF',
}

const BrandColors: BrandColors = {
  primary: '#333333',
  primaryDisabled: '#0000000D',
  secondary: GrayscaleColors.white,
  secondaryDisabled: '#00000061',
  primaryLight: '#FFFFFFA6',
  highlight: '#F16C00',
  primaryBackground: '#F4F4F4',
  secondaryBackground: GrayscaleColors.white,
  recordBackground: '#9D745214',
  brandedSecondary: GrayscaleColors.white,
  modalPrimary: '#003366',
  modalSecondary: GrayscaleColors.white,
  modalPrimaryBackground: GrayscaleColors.white,
  modalSecondaryBackground: GrayscaleColors.veryLightGrey,
  modalIcon: GrayscaleColors.darkGrey,
  unorderedList: GrayscaleColors.darkGrey,
  unorderedListModal: GrayscaleColors.darkGrey,
  link: '#004FC7',
  text: '#000000E6',
  label: '#000000A6',
  icon: '#00000061',
  headerIcon: GrayscaleColors.black,
  headerText: GrayscaleColors.black,
  buttonText: GrayscaleColors.white,
  tabBarInactive: GrayscaleColors.white,
}

const SemanticColors: SemanticColors = {
  error: '#EF2727',
  errorTransparent: '#EF27271F',
  errorTransparentLight: '#EF272712',
  success: '#008E5B',
  successTransparent: '#008E5B1F',
  focus: '#3399FF',
}

const NotificationColors: INotificationColors = {
  success: '#DFF0D8',
  successBorder: '#D6E9C6',
  successIcon: '#2D4821',
  successText: '#2D4821',
  info: '#5069C3',
  infoBorder: '#B9CEDE',
  infoIcon: GrayscaleColors.darkGrey,
  infoText: GrayscaleColors.darkGrey,
  warn: '#FFB700',
  warnBorder: '#FAEBCC',
  warnIcon: '#6C4A00',
  warnText: '#6C4A00',
  error: '#F2DEDE',
  errorBorder: '#EBCCD1',
  errorIcon: '#EF2727',
  errorText: '#EF2727',
  popupOverlay: `rgba(0, 0, 0, ${mediumOpacity})`,
}

export const ColorPallet: ColorPallet = {
  brand: BrandColors,
  semantic: SemanticColors,
  notification: NotificationColors,
  grayscale: GrayscaleColors,
}

export const FontWeights: FontWeights = {
  light: '300',
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
  bolder: '800',
}

const HekaTextTheme: HekaTextTheme = {
  display: {
    fontFamily: 'Inter',
    fontSize: 56,
    lineHeight: 64,
    fontWeight: FontWeights.light,
    color: ColorPallet.brand.text,
  },
  headlineLarge: {
    fontFamily: 'Inter',
    fontSize: 34,
    lineHeight: 40,
    fontWeight: FontWeights.bolder,
    color: ColorPallet.brand.text,
  },
  headlineMedium: {
    fontFamily: 'Inter',
    fontSize: 24,
    lineHeight: 32,
    fontWeight: FontWeights.semibold,
    color: ColorPallet.brand.text,
  },
  headlineSmall: {
    fontFamily: 'Inter',
    fontSize: 20,
    lineHeight: 28,
    fontWeight: FontWeights.bold,
    color: ColorPallet.brand.text,
  },
  subtitleMedium: {
    fontFamily: 'Inter',
    fontSize: 16,
    lineHeight: 24,
    fontWeight: FontWeights.semibold,
    color: ColorPallet.brand.text,
  },
  subtitleSmall: {
    fontFamily: 'Inter',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: FontWeights.medium,
    color: ColorPallet.brand.text,
  },
  bodyMedium: {
    fontFamily: 'Inter',
    fontSize: 16,
    lineHeight: 24,
    fontWeight: FontWeights.regular,
    color: ColorPallet.brand.text,
  },
  bodySmall: {
    fontFamily: 'Inter',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: FontWeights.regular,
    color: ColorPallet.brand.text,
  },
  labelLarge: {
    fontFamily: 'Inter',
    fontSize: 15,
    lineHeight: 24,
    fontWeight: FontWeights.medium,
    color: ColorPallet.brand.text,
  },
  labelMedium: {
    fontFamily: 'Inter',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: FontWeights.regular,
    color: ColorPallet.brand.text,
  },
  labelSmall: {
    fontFamily: 'Inter',
    fontSize: 11,
    lineHeight: 16,
    fontWeight: FontWeights.regular,
    color: ColorPallet.brand.text,
  },
}

const TextTheme: ITextTheme = {
  headingOne: HekaTextTheme.headlineLarge,
  headingTwo: HekaTextTheme.headlineLarge,
  headingThree: { ...HekaTextTheme.headlineMedium, fontWeight: FontWeights.bold },
  headingFour: HekaTextTheme.headlineSmall,
  normal: HekaTextTheme.bodyMedium,
  bold: {
    ...HekaTextTheme.bodyMedium,
    fontWeight: FontWeights.bold,
  },
  label: {
    ...HekaTextTheme.labelMedium,
    color: ColorPallet.brand.label,
  },
  labelTitle: HekaTextTheme.labelLarge,
  labelSubtitle: HekaTextTheme.labelMedium,
  labelText: HekaTextTheme.labelSmall,
  caption: HekaTextTheme.bodySmall,
  title: {
    ...HekaTextTheme.headlineSmall,
    color: ColorPallet.notification.infoText,
  },
  headerTitle: {
    ...HekaTextTheme.headlineSmall,
  },
  modalNormal: HekaTextTheme.subtitleMedium,
  modalTitle: HekaTextTheme.headlineLarge,
  modalHeadingOne: HekaTextTheme.headlineLarge,
  modalHeadingThree: HekaTextTheme.headlineMedium,
  popupModalText: HekaTextTheme.bodyMedium,
  settingsText: HekaTextTheme.headlineSmall,
}

const Inputs: IInputs = StyleSheet.create({
  label: {
    ...TextTheme.label,
  },
  textInput: {
    ...TextTheme.normal,
    padding: Spacing.xs,
    borderRadius: BorderRadius.medium,
    backgroundColor: ColorPallet.brand.primaryBackground,
    borderWidth: BorderWidth.small,
    borderColor: ColorPallet.brand.secondaryDisabled,
  },
  inputSelected: {
    borderColor: ColorPallet.brand.primary,
  },
  singleSelect: {
    padding: Spacing.md,
    borderRadius: BorderRadius.small,
    backgroundColor: ColorPallet.brand.secondaryBackground,
  },
  singleSelectText: {
    ...TextTheme.normal,
  },
  singleSelectIcon: {
    color: ColorPallet.brand.text,
  },
  checkBoxColor: {
    color: ColorPallet.brand.primary,
  },
  checkBoxText: {
    ...TextTheme.normal,
  },
})

const defaultButtonStyle = {
  paddingHorizontal: Spacing.md,
  paddingVertical: Spacing.sm,
  borderRadius: BorderRadius.medium,
  backgroundColor: ColorPallet.brand.primary,
}

const defaultButtonTextStyle = {
  ...TextTheme.normal,
  fontWeight: FontWeights.bold,
  color: ColorPallet.grayscale.white,
  textAlign: 'center',
} as const

const Buttons = StyleSheet.create({
  critical: {
    padding: Spacing.md,
    backgroundColor: SemanticColors.error,
  },

  primary: defaultButtonStyle,
  primaryDisabled: {
    backgroundColor: ColorPallet.brand.primaryDisabled,
  },
  primaryText: defaultButtonTextStyle,
  primaryTextDisabled: { color: ColorPallet.brand.secondaryDisabled },

  secondary: {
    ...defaultButtonStyle,
    backgroundColor: 'transparent',
    borderWidth: BorderWidth.small,
    borderColor: ColorPallet.brand.primary,
  },
  secondaryCritical: {
    ...defaultButtonStyle,
    backgroundColor: 'transparent',
    borderWidth: BorderWidth.small,
    borderColor: ColorPallet.semantic.error,
  },
  secondaryCriticalText: { ...defaultButtonTextStyle, color: ColorPallet.semantic.error },
  secondaryDisabled: {
    borderColor: ColorPallet.brand.primaryDisabled,
  },
  secondaryText: { ...defaultButtonTextStyle, color: ColorPallet.brand.primary },
  secondaryTextDisabled: { color: ColorPallet.brand.secondaryDisabled },

  modalCritical: { ...defaultButtonStyle, backgroundColor: SemanticColors.error },

  modalPrimary: defaultButtonStyle,
  modalPrimaryText: defaultButtonTextStyle,

  modalSecondary: {
    ...defaultButtonStyle,
    backgroundColor: 'transparent',
    borderWidth: BorderWidth.small,
    borderColor: ColorPallet.brand.primary,
  },
  modalSecondaryText: { ...defaultButtonTextStyle, color: ColorPallet.brand.primary },
})

const ListItems = StyleSheet.create({
  credentialBackground: {
    backgroundColor: ColorPallet.brand.secondaryBackground,
  },
  credentialTitle: {
    ...TextTheme.headingFour,
  },
  credentialDetails: {
    ...TextTheme.caption,
  },
  credentialOfferBackground: {
    backgroundColor: ColorPallet.brand.modalPrimaryBackground,
  },
  credentialOfferTitle: {
    ...TextTheme.modalHeadingThree,
  },
  credentialOfferDetails: {
    ...TextTheme.normal,
  },
  revoked: {
    backgroundColor: ColorPallet.notification.error,
    borderColor: ColorPallet.notification.errorBorder,
  },
  contactBackground: {
    backgroundColor: ColorPallet.brand.secondaryBackground,
  },
  credentialIconColor: {
    color: ColorPallet.notification.infoText,
  },
  contactTitle: {
    fontFamily: TextTheme.title.fontFamily,
    color: ColorPallet.grayscale.darkGrey,
  },
  contactDate: {
    fontFamily: TextTheme.normal.fontFamily,
    color: ColorPallet.grayscale.darkGrey,
    marginTop: Spacing.xs,
  },
  contactIconBackground: {
    backgroundColor: ColorPallet.brand.primary,
  },
  contactIcon: {
    color: ColorPallet.brand.text,
  },
  recordAttributeLabel: {
    ...TextTheme.normal,
  },
  recordContainer: {
    backgroundColor: ColorPallet.brand.secondaryBackground,
  },
  recordBorder: {
    borderBottomColor: ColorPallet.brand.primaryBackground,
  },
  recordLink: {
    color: ColorPallet.brand.link,
  },
  showButton: {
    color: BrandColors.text,
  },
  recordAttributeText: {
    ...TextTheme.normal,
  },
  proofIcon: {
    ...TextTheme.headingOne,
  },
  proofError: {
    color: ColorPallet.semantic.error,
  },
  proofListItem: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.md,
    backgroundColor: ColorPallet.brand.primaryBackground,
    borderTopColor: ColorPallet.brand.secondaryBackground,
    borderBottomColor: ColorPallet.brand.secondaryBackground,
    borderTopWidth: BorderWidth.medium,
    borderBottomWidth: BorderWidth.medium,
  },
  avatarText: {
    ...TextTheme.headingTwo,
    fontWeight: FontWeights.regular,
  },
  avatarCircle: {
    borderRadius: TextTheme.headingTwo.fontSize,
    borderColor: ColorPallet.grayscale.lightGrey,
    width: TextTheme.headingTwo.fontSize * 2,
    height: TextTheme.headingTwo.fontSize * 2,
  },
  emptyList: {
    ...TextTheme.normal,
  },
  requestTemplateBackground: {
    backgroundColor: ColorPallet.grayscale.white,
  },
  requestTemplateIconColor: {
    color: ColorPallet.notification.infoText,
  },
  requestTemplateTitle: {
    color: ColorPallet.grayscale.black,
    fontWeight: FontWeights.bold,
  },
  requestTemplateDetails: {
    color: ColorPallet.grayscale.black,
    fontWeight: FontWeights.regular,
  },
  requestTemplateZkpLabel: {
    color: ColorPallet.grayscale.mediumGrey,
  },
  requestTemplateIcon: {
    color: ColorPallet.grayscale.black,
  },
  requestTemplateDate: {
    color: ColorPallet.grayscale.mediumGrey,
  },
})

const TabTheme = {
  tabBarStyle: {
    position: 'absolute',
    height: 65,
    backgroundColor: ColorPallet.brand.secondaryBackground,
    shadowOffset: { width: 0, height: -3 },
    shadowRadius: 6,
    shadowColor: ColorPallet.grayscale.black,
    shadowOpacity: 0.07,
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.md,
    borderRadius: BorderRadius.big,
    paddingTop: Spacing.xxxs,
    paddingHorizontal: Spacing.xxxs,
    paddingBottom: Spacing.xxxs,
  },
  tabBarContainerStyle: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: Spacing.xxs,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.medium,
    alignSelf: 'stretch',
  },
  tabBarActiveTintColor: ColorPallet.brand.text,
  tabBarInactiveTintColor: ColorPallet.brand.text,
  tabBarTextStyle: TextTheme.labelText,
  tabBarButtonIconStyle: {
    color: ColorPallet.grayscale.white,
  },
  focusTabActiveTintColor: {
    backgroundColor: ColorPallet.brand.text,
  },
}

const NavigationTheme = {
  dark: true,
  colors: {
    primary: ColorPallet.brand.primary,
    background: ColorPallet.brand.primaryBackground,
    card: ColorPallet.brand.primary,
    text: ColorPallet.brand.text,
    border: ColorPallet.grayscale.white,
    notification: ColorPallet.grayscale.white,
  },
}

const HomeTheme = StyleSheet.create({
  welcomeHeader: {
    ...TextTheme.headingOne,
  },
  credentialMsg: {
    ...TextTheme.normal,
  },
  notificationsHeader: {
    ...TextTheme.headingThree,
  },
  noNewUpdatesText: {
    ...TextTheme.normal,
    color: ColorPallet.notification.infoText,
  },
  link: {
    ...TextTheme.normal,
    color: ColorPallet.brand.link,
  },
})

const SettingsTheme = {
  groupHeader: {
    ...TextTheme.labelSubtitle,
    color: ColorPallet.brand.label,
    marginBottom: Spacing.xs,
  },
  groupBackground: ColorPallet.brand.secondaryBackground,
  iconColor: ColorPallet.grayscale.darkGrey,
  text: TextTheme.normal,
}

const ChatTheme = {
  containerStyle: {
    paddingTop: Spacing.xs,
    marginBottom: Spacing.md,
    marginHorizontal: Spacing.md,
    flexDirection: 'column',
    alignItems: 'flex-start',
    alignSelf: 'flex-end',
  },
  leftBubble: {
    backgroundColor: ColorPallet.brand.primaryBackground,
    borderTopLeftRadius: BorderRadius.big,
    borderTopRightRadius: BorderRadius.big,
    borderBottomRightRadius: BorderRadius.big,
    borderBottomLeftRadius: 0,
    paddingVertical: Spacing.xxs,
    paddingHorizontal: Spacing.sm,
    marginLeft: 0,
  },
  rightBubble: {
    backgroundColor: ColorPallet.brand.primary,
    borderTopLeftRadius: BorderRadius.big,
    borderTopRightRadius: BorderRadius.big,
    borderBottomLeftRadius: BorderRadius.big,
    borderBottomRightRadius: 0,
    paddingVertical: Spacing.xxs,
    paddingHorizontal: Spacing.sm,
    marginRight: 0,
  },
  timeStyleLeft: {
    ...HekaTextTheme.labelSmall,
    color: ColorPallet.brand.label,
    marginTop: Spacing.xs,
  },
  timeStyleRight: {
    ...HekaTextTheme.labelSmall,
    color: ColorPallet.brand.primaryLight,
    marginTop: Spacing.xs,
  },
  leftText: TextTheme.normal,
  leftTextHighlighted: {
    ...TextTheme.normal,
    fontWeight: FontWeights.bolder,
  },
  rightText: {
    ...TextTheme.normal,
    color: ColorPallet.grayscale.white,
  },
  rightTextHighlighted: {
    ...TextTheme.normal,
    color: ColorPallet.grayscale.white,
    fontWeight: FontWeights.bolder,
  },
  inputToolbar: {
    backgroundColor: ColorPallet.brand.primaryBackground,
  },
  inputText: {
    ...TextTheme.normal,
    // We don't want to set line height here as it may cause minor (but visible) resizing when user starts to enter the text
    lineHeight: undefined,
  },
  placeholderText: ColorPallet.brand.secondaryDisabled,
  sendContainer: {
    marginBottom: Spacing.xxxs,
    paddingHorizontal: Spacing.xxxs,
    justifyContent: 'center',
  },
  sendEnabled: ColorPallet.brand.primary,
  sendDisabled: ColorPallet.brand.secondaryDisabled,
  options: ColorPallet.brand.primary,
  optionsText: ColorPallet.grayscale.black,
  openButtonStyle: {
    borderRadius: BorderRadius.large,
    borderWidth: BorderWidth.small,
    backgroundColor: ColorPallet.brand.primary,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.md,
    marginTop: Spacing.md,
  },
  openButtonTextStyle: {
    color: ColorPallet.brand.secondary,
    fontSize: TextTheme.normal.fontSize,
    fontWeight: FontWeights.bold,
    textAlign: 'center',
  },
  documentIconContainer: {
    backgroundColor: ColorPallet.brand.primary,
    alignSelf: 'flex-start',
    padding: Spacing.xxxs,
    borderRadius: BorderRadius.extraSmall,
    marginBottom: Spacing.xs,
  },
  documentIcon: {
    color: ColorPallet.grayscale.white,
  },
}

const OnboardingTheme = {
  container: {
    backgroundColor: ColorPallet.brand.primaryBackground,
  },
  carouselContainer: {
    backgroundColor: ColorPallet.brand.primaryBackground,
  },
  pagerDot: {
    borderColor: ColorPallet.brand.primary,
  },
  pagerDotActive: {
    color: ColorPallet.brand.primary,
  },
  pagerDotInactive: {
    color: ColorPallet.brand.primaryDisabled,
  },
  pagerNavigationButton: {
    color: ColorPallet.brand.primary,
  },
  headerTintColor: ColorPallet.grayscale.white,
  headerText: {
    ...TextTheme.headingTwo,
    color: ColorPallet.notification.infoText,
  },
  bodyText: {
    ...TextTheme.normal,
    color: ColorPallet.notification.infoText,
  },
  imageDisplayOptions: {
    fill: ColorPallet.notification.infoText,
  },
}

const DialogTheme = {
  modalView: {
    backgroundColor: ColorPallet.brand.secondaryBackground,
  },
  titleText: {
    color: ColorPallet.grayscale.white,
  },
  description: {
    color: ColorPallet.grayscale.white,
  },
  closeButtonIcon: {
    color: ColorPallet.grayscale.white,
  },
  carouselButtonText: {
    color: ColorPallet.grayscale.white,
  },
}

const LoadingTheme = {
  backgroundColor: ColorPallet.brand.primaryBackground,
}

const PINEnterTheme = {
  image: {
    alignSelf: 'center',
    marginBottom: Spacing.md,
  },
}

const PINInputTheme = {
  cell: {
    backgroundColor: ColorPallet.grayscale.lightGrey,
  },
  focussedCell: {
    borderColor: '#3399FF',
  },
  cellText: {
    color: ColorPallet.brand.primary,
  },
  icon: {
    color: ColorPallet.brand.primary,
  },
}

const Assets: Assets = {
  svg: {
    ...BifoldImageAssets.svg,
    logo: Logo,
    logoFull: LogoFull,
  },
  img: {
    logoPrimary: {
      src: require('../assets/logo-small.png'),
    },
    logoSecondary: {
      src: require('../assets/logo-large.png'),
      aspectRatio: 1,
      height: '33%',
      width: '33%',
      resizeMode: 'contain',
    },
  },
}

const PaperTheme: PaperTheme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    error: ColorPallet.semantic.error,
  },
}

const defaultBorderRadius = 4
const defaultBorderWidth = 2

export const theme: HekaTheme = {
  ColorPallet,
  IconSizes,
  Spacing,
  HekaTextTheme: HekaTextTheme,
  TextTheme,
  FontWeights,
  Buttons,
  heavyOpacity,
  BorderRadius,
  borderRadius: defaultBorderRadius,
  BorderWidth,
  borderWidth: defaultBorderWidth,
  Inputs,
  ListItems,
  TabTheme,
  NavigationTheme,
  HomeTheme,
  SettingsTheme,
  ChatTheme,
  OnboardingTheme,
  DialogTheme,
  LoadingTheme,
  PINEnterTheme,
  PINInputTheme,
  Assets,
  PaperTheme,
}

export const useHekaTheme = (): HekaTheme => {
  return useTheme() as HekaTheme
}

export const useGlobalStyles = () => {
  // Note that here we're getting header height without taking into account safe area at the top -> 3rd argument in 'getDefaultHeaderHeight' is set to 0.
  const defaultHeaderHeight = useMemo(() => getDefaultHeaderHeight(windowDimensions, false, 0), [])
  const adaptivePadding = useMemo(() => windowDimensions.height * 0.22, [])

  return StyleSheet.create({
    absolute: {
      position: 'absolute',
      right: 0,
      left: 0,
      top: 0,
      bottom: 0,
    },
    defaultContainer: {
      flex: 1,
      paddingHorizontal: Spacing.xl,
      paddingBottom: Spacing.xs,
    },
    defaultButtonContainer: {
      width: defaultButtonWidth,
    },
    centeredView: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      marginTop: Spacing.xl,
    },
    modalContent: {
      margin: Spacing.md,
      backgroundColor: ColorPallet.grayscale.darkGrey,
      borderRadius: BorderRadius.bigger,
      borderColor: ColorPallet.grayscale.inactiveGray,
      padding: Spacing.xxl,
      alignItems: 'center',
      shadowColor: ColorPallet.grayscale.black,
      shadowOffset: {
        width: 0,
        height: 2,
      },
      shadowOpacity: 0.25,
      shadowRadius: 4,
      elevation: 5,
    },
    adaptivePadding: {
      paddingTop: adaptivePadding - defaultHeaderHeight,
      paddingBottom: adaptivePadding / 2,
    },
    logoContainer: {
      flexGrow: 1,
      alignItems: 'center',
      paddingHorizontal: Spacing.xl,
    },
    card: {
      width: '100%',
      overflow: 'hidden',
    },
    multilineTextCard: {
      // 20% opacity
      backgroundColor: `${ColorPallet.grayscale.mediumGrey}33`,
      borderRadius: BorderRadius.small,
      borderColor: 'transparent',
      padding: Spacing.md,
    },
  })
}
