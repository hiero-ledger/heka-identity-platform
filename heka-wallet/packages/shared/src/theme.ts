import type {
  ITheme,
  IBrandColors,
  IInputs,
  IGrayscaleColors,
  IColorPalette,
  ISemanticColors,
  INotificationColors,
  ITextTheme,
  IAssets,
  ISVGAssets,
  IInlineInputMessage,
  ISpacing,
  IFontAttributes,
} from '@bifold/core'
import type { MD3Theme as PaperTheme } from 'react-native-paper'

import { useTheme, ImageAssets as BifoldImageAssets } from '@bifold/core'
import { getDefaultHeaderHeight } from '@react-navigation/elements'
import React, { useMemo } from 'react'
import { Dimensions, StyleSheet, ViewStyle } from 'react-native'
import { MD3LightTheme } from 'react-native-paper'
import { SvgProps } from 'react-native-svg'

const heavyOpacity = 0.7 as const
const mediumOpacity = 0.5 as const
const maxFontSizeMultiplier = 2

type INavigationTheme = ITheme['NavigationTheme']
type IPINInputTheme = ITheme['PINInputTheme']
type ISeparatedPINInputTheme = ITheme['SeparatedPINInputTheme']

import LogoFull from '../assets/logo-full.svg'
import Logo from '../assets/logo.svg'

export interface HekaTheme extends ITheme {
  Assets: Assets
  HekaTextTheme: HekaTextTheme
  ColorPalette: HekaColorPalette
  IconSizes: IconSizes
  Spacing: HekaSpacing
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
  fontWeight: NonNullable<IFontAttributes['fontWeight']>
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

interface HekaColorPalette extends IColorPalette {
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

interface HekaSpacing extends ISpacing {
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

const Spacing: HekaSpacing = {
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
  tertiary: GrayscaleColors.white,
  tertiaryDisabled: '#00000061',
  primaryLight: '#FFFFFFA6',
  highlight: '#F16C00',
  primaryBackground: '#F4F4F4',
  secondaryBackground: GrayscaleColors.white,
  tertiaryBackground: GrayscaleColors.white,
  recordBackground: '#9D745214',
  brandedSecondary: GrayscaleColors.white,
  modalPrimary: '#003366',
  modalSecondary: GrayscaleColors.white,
  modalTertiary: GrayscaleColors.white,
  modalPrimaryBackground: GrayscaleColors.white,
  modalSecondaryBackground: GrayscaleColors.veryLightGrey,
  modalTertiaryBackground: GrayscaleColors.veryLightGrey,
  modalIcon: GrayscaleColors.darkGrey,
  unorderedList: GrayscaleColors.darkGrey,
  unorderedListModal: GrayscaleColors.darkGrey,
  link: '#004FC7',
  credentialLink: '#004FC7',
  text: '#000000E6',
  label: '#000000A6',
  icon: '#00000061',
  headerIcon: GrayscaleColors.black,
  headerText: GrayscaleColors.black,
  buttonText: GrayscaleColors.white,
  tabBarInactive: GrayscaleColors.white,
  inlineError: '#EF2727',
  inlineWarning: '#FF9000',
  loadingIcon: GrayscaleColors.white,
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

export const ColorPalette: HekaColorPalette = {
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
    color: ColorPalette.brand.text,
  },
  headlineLarge: {
    fontFamily: 'Inter',
    fontSize: 34,
    lineHeight: 40,
    fontWeight: FontWeights.bolder,
    color: ColorPalette.brand.text,
  },
  headlineMedium: {
    fontFamily: 'Inter',
    fontSize: 24,
    lineHeight: 32,
    fontWeight: FontWeights.semibold,
    color: ColorPalette.brand.text,
  },
  headlineSmall: {
    fontFamily: 'Inter',
    fontSize: 20,
    lineHeight: 28,
    fontWeight: FontWeights.bold,
    color: ColorPalette.brand.text,
  },
  subtitleMedium: {
    fontFamily: 'Inter',
    fontSize: 16,
    lineHeight: 24,
    fontWeight: FontWeights.semibold,
    color: ColorPalette.brand.text,
  },
  subtitleSmall: {
    fontFamily: 'Inter',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: FontWeights.medium,
    color: ColorPalette.brand.text,
  },
  bodyMedium: {
    fontFamily: 'Inter',
    fontSize: 16,
    lineHeight: 24,
    fontWeight: FontWeights.regular,
    color: ColorPalette.brand.text,
  },
  bodySmall: {
    fontFamily: 'Inter',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: FontWeights.regular,
    color: ColorPalette.brand.text,
  },
  labelLarge: {
    fontFamily: 'Inter',
    fontSize: 15,
    lineHeight: 24,
    fontWeight: FontWeights.medium,
    color: ColorPalette.brand.text,
  },
  labelMedium: {
    fontFamily: 'Inter',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: FontWeights.regular,
    color: ColorPalette.brand.text,
  },
  labelSmall: {
    fontFamily: 'Inter',
    fontSize: 11,
    lineHeight: 16,
    fontWeight: FontWeights.regular,
    color: ColorPalette.brand.text,
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
    color: ColorPalette.brand.label,
  },
  labelTitle: HekaTextTheme.labelLarge,
  labelSubtitle: HekaTextTheme.labelMedium,
  labelText: {
    ...HekaTextTheme.labelSmall,
    fontStyle: 'normal',
  },
  caption: HekaTextTheme.bodySmall,
  title: {
    ...HekaTextTheme.headlineSmall,
    color: ColorPalette.notification.infoText,
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
  inlineErrorText: {
    fontSize: 16,
    fontWeight: FontWeights.regular,
    color: ColorPalette.brand.inlineError,
  },
  inlineWarningText: {
    fontSize: 16,
    fontWeight: FontWeights.regular,
    color: ColorPalette.brand.inlineWarning,
  },
}

const Inputs: IInputs = StyleSheet.create({
  label: {
    ...TextTheme.label,
  },
  textInput: {
    ...TextTheme.normal,
    padding: Spacing.xs,
    borderRadius: BorderRadius.medium,
    backgroundColor: ColorPalette.brand.primaryBackground,
    borderWidth: BorderWidth.small,
    borderColor: ColorPalette.brand.secondaryDisabled,
  },
  inputSelected: {
    borderColor: ColorPalette.brand.primary,
  },
  singleSelect: {
    padding: Spacing.md,
    borderRadius: BorderRadius.small,
    backgroundColor: ColorPalette.brand.secondaryBackground,
  },
  singleSelectText: {
    ...TextTheme.normal,
  },
  singleSelectIcon: {
    color: ColorPalette.brand.text,
  },
  checkBoxColor: {
    color: ColorPalette.brand.primary,
  },
  checkBoxText: {
    ...TextTheme.normal,
  },
})

const defaultButtonStyle = {
  padding: 0,
  paddingHorizontal: Spacing.md,
  paddingVertical: Spacing.sm,
  borderRadius: BorderRadius.medium,
  backgroundColor: ColorPalette.brand.primary,
}

const defaultButtonTextStyle = {
  ...TextTheme.normal,
  fontWeight: FontWeights.bold,
  color: ColorPalette.grayscale.white,
  textAlign: 'center',
} as const

const Buttons = StyleSheet.create({
  critical: {
    padding: Spacing.md,
    borderRadius: BorderRadius.medium,
    backgroundColor: SemanticColors.error,
  },

  primary: defaultButtonStyle,
  primaryDisabled: {
    ...defaultButtonStyle,
    backgroundColor: ColorPalette.brand.primaryDisabled,
  },
  primaryText: defaultButtonTextStyle,
  primaryTextDisabled: { ...defaultButtonTextStyle, color: ColorPalette.brand.secondaryDisabled },

  secondary: {
    ...defaultButtonStyle,
    backgroundColor: 'transparent',
    borderWidth: BorderWidth.small,
    borderColor: ColorPalette.brand.primary,
  },
  secondaryCritical: {
    ...defaultButtonStyle,
    backgroundColor: 'transparent',
    borderWidth: BorderWidth.small,
    borderColor: ColorPalette.semantic.error,
  },
  secondaryCriticalText: { ...defaultButtonTextStyle, color: ColorPalette.semantic.error },
  secondaryDisabled: {
    ...defaultButtonStyle,
    backgroundColor: 'transparent',
    borderWidth: BorderWidth.small,
    borderColor: ColorPalette.brand.primaryDisabled,
  },
  secondaryText: { ...defaultButtonTextStyle, color: ColorPalette.brand.primary },
  secondaryTextDisabled: { ...defaultButtonTextStyle, color: ColorPalette.brand.secondaryDisabled },

  modalCritical: { ...defaultButtonStyle, backgroundColor: SemanticColors.error },

  modalPrimary: defaultButtonStyle,
  modalPrimaryText: defaultButtonTextStyle,

  modalSecondary: {
    ...defaultButtonStyle,
    backgroundColor: 'transparent',
    borderWidth: BorderWidth.small,
    borderColor: ColorPalette.brand.primary,
  },
  modalSecondaryText: { ...defaultButtonTextStyle, color: ColorPalette.brand.primary },
})

const ListItems = StyleSheet.create({
  credentialBackground: {
    backgroundColor: ColorPalette.brand.secondaryBackground,
  },
  credentialTitle: {
    ...TextTheme.headingFour,
  },
  credentialDetails: {
    ...TextTheme.caption,
  },
  credentialOfferBackground: {
    backgroundColor: ColorPalette.brand.modalPrimaryBackground,
  },
  credentialOfferTitle: {
    ...TextTheme.modalHeadingThree,
  },
  credentialOfferDetails: {
    ...TextTheme.normal,
  },
  revoked: {
    backgroundColor: ColorPalette.notification.error,
    borderColor: ColorPalette.notification.errorBorder,
  },
  contactBackground: {
    backgroundColor: ColorPalette.brand.secondaryBackground,
  },
  credentialIconColor: {
    color: ColorPalette.notification.infoText,
  },
  contactTitle: {
    fontFamily: TextTheme.title.fontFamily,
    color: ColorPalette.grayscale.darkGrey,
  },
  contactDate: {
    fontFamily: TextTheme.normal.fontFamily,
    color: ColorPalette.grayscale.darkGrey,
    marginTop: Spacing.xs,
  },
  contactIconBackground: {
    backgroundColor: ColorPalette.brand.primary,
  },
  contactIcon: {
    color: ColorPalette.brand.text,
  },
  recordAttributeLabel: {
    ...TextTheme.normal,
  },
  recordContainer: {
    backgroundColor: ColorPalette.brand.secondaryBackground,
  },
  recordBorder: {
    borderBottomColor: ColorPalette.brand.primaryBackground,
  },
  recordLink: {
    color: ColorPalette.brand.link,
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
    color: ColorPalette.semantic.error,
  },
  proofListItem: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.md,
    backgroundColor: ColorPalette.brand.primaryBackground,
    borderTopColor: ColorPalette.brand.secondaryBackground,
    borderBottomColor: ColorPalette.brand.secondaryBackground,
    borderTopWidth: BorderWidth.medium,
    borderBottomWidth: BorderWidth.medium,
  },
  avatarText: {
    ...TextTheme.headingTwo,
    fontWeight: FontWeights.regular,
  },
  avatarCircle: {
    borderRadius: TextTheme.headingTwo.fontSize,
    borderColor: ColorPalette.grayscale.lightGrey,
    width: TextTheme.headingTwo.fontSize * 2,
    height: TextTheme.headingTwo.fontSize * 2,
  },
  emptyList: {
    ...TextTheme.normal,
  },
  requestTemplateBackground: {
    backgroundColor: ColorPalette.grayscale.white,
  },
  requestTemplateIconColor: {
    color: ColorPalette.notification.infoText,
  },
  requestTemplateTitle: {
    color: ColorPalette.grayscale.black,
    fontWeight: FontWeights.bold,
  },
  requestTemplateDetails: {
    color: ColorPalette.grayscale.black,
    fontWeight: FontWeights.regular,
  },
  requestTemplateZkpLabel: {
    color: ColorPalette.grayscale.mediumGrey,
  },
  requestTemplateIcon: {
    color: ColorPalette.grayscale.black,
  },
  requestTemplateDate: {
    color: ColorPalette.grayscale.mediumGrey,
  },
})

const TabTheme = {
  tabBarStyle: {
    position: 'absolute' as const,
    height: 65,
    backgroundColor: ColorPalette.brand.secondaryBackground,
    shadowOffset: { width: 0, height: -3 },
    shadowRadius: 6,
    shadowColor: ColorPalette.grayscale.black,
    shadowOpacity: 0.07,
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.md,
    borderRadius: BorderRadius.big,
    paddingTop: Spacing.xxxs,
    paddingHorizontal: Spacing.xxxs,
    paddingBottom: Spacing.xxxs,
    borderTopWidth: 0,
  },
  tabBarContainerStyle: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    paddingVertical: Spacing.xxs,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.medium,
    alignSelf: 'stretch' as const,
  },
  tabBarActiveTintColor: ColorPalette.brand.text,
  tabBarInactiveTintColor: ColorPalette.brand.text,
  tabBarTextStyle: {
    ...TextTheme.labelText,
    paddingBottom: 0,
  },
  tabBarButtonIconStyle: {
    color: ColorPalette.grayscale.white,
  },
  focusTabIconStyle: {
    height: 60,
    width: 60,
    backgroundColor: ColorPalette.brand.primary,
    borderRadius: 60,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  focusTabActiveTintColor: {
    backgroundColor: ColorPalette.brand.text,
  },
  tabBarSecondaryBackgroundColor: ColorPalette.brand.secondaryBackground,
}

const NavigationTheme: INavigationTheme = {
  dark: true,
  colors: {
    primary: ColorPalette.brand.primary,
    background: ColorPalette.brand.primaryBackground,
    card: ColorPalette.brand.primary,
    text: ColorPalette.brand.text,
    border: ColorPalette.grayscale.white,
    notification: ColorPalette.grayscale.white,
  },
  header: {
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 6,
    shadowColor: ColorPalette.grayscale.black,
    shadowOpacity: 0.15,
    elevation: 0,
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
    color: ColorPalette.notification.infoText,
  },
  link: {
    ...TextTheme.normal,
    color: ColorPalette.brand.link,
  },
})

const SettingsTheme = {
  groupHeader: {
    ...TextTheme.labelSubtitle,
    color: ColorPalette.brand.label,
    marginBottom: Spacing.xs,
  },
  groupBackground: ColorPalette.brand.secondaryBackground,
  iconColor: ColorPalette.grayscale.darkGrey,
  text: {
    ...TextTheme.normal,
    color: ColorPalette.notification.infoText,
  },
}

const ChatTheme = {
  containerStyle: {
    paddingTop: Spacing.xs,
    marginBottom: Spacing.md,
    marginLeft: Spacing.md,
    marginRight: Spacing.md,
    flexDirection: 'column' as const,
    alignItems: 'flex-start' as const,
    alignSelf: 'flex-end' as const,
  },
  leftBubble: {
    backgroundColor: ColorPalette.brand.primaryBackground,
    borderRadius: BorderRadius.big,
    borderBottomLeftRadius: 0,
    padding: 0,
    paddingVertical: Spacing.xxs,
    paddingHorizontal: Spacing.sm,
    marginLeft: 0,
  },
  rightBubble: {
    backgroundColor: ColorPalette.brand.primary,
    borderRadius: BorderRadius.big,
    borderBottomRightRadius: 0,
    padding: 0,
    paddingVertical: Spacing.xxs,
    paddingHorizontal: Spacing.sm,
    marginRight: 0,
  },
  timeStyleLeft: {
    ...HekaTextTheme.labelSmall,
    color: ColorPalette.brand.label,
    marginTop: Spacing.xs,
  },
  timeStyleRight: {
    ...HekaTextTheme.labelSmall,
    color: ColorPalette.brand.primaryLight,
    marginTop: Spacing.xs,
  },
  leftText: {
    ...TextTheme.normal,
  },
  leftTextHighlighted: {
    ...TextTheme.normal,
    fontWeight: FontWeights.bolder,
  },
  rightText: {
    ...TextTheme.normal,
    color: ColorPalette.grayscale.white,
  },
  rightTextHighlighted: {
    ...TextTheme.normal,
    color: ColorPalette.grayscale.white,
    fontWeight: FontWeights.bolder,
  },
  inputToolbar: {
    backgroundColor: ColorPalette.brand.primaryBackground,
    shadowColor: ColorPalette.brand.primaryDisabled,
    borderRadius: BorderRadius.medium,
  },
  inputText: {
    ...TextTheme.normal,
    // We don't want to set line height here as it may cause minor (but visible) resizing when user starts to enter the text
    lineHeight: undefined,
  },
  placeholderText: ColorPalette.brand.secondaryDisabled,
  sendContainer: {
    marginBottom: Spacing.xxxs,
    paddingHorizontal: Spacing.xxxs,
    justifyContent: 'center' as const,
  },
  sendEnabled: ColorPalette.brand.primary,
  sendDisabled: ColorPalette.brand.secondaryDisabled,
  options: ColorPalette.brand.primary,
  optionsText: ColorPalette.grayscale.black,
  openButtonStyle: {
    borderRadius: BorderRadius.large,
    borderWidth: BorderWidth.small,
    backgroundColor: ColorPalette.brand.primary,
    paddingTop: Spacing.xs,
    paddingBottom: Spacing.xs,
    paddingLeft: Spacing.md,
    paddingRight: Spacing.md,
    marginTop: Spacing.md,
  },
  openButtonTextStyle: {
    color: ColorPalette.brand.secondary,
    fontSize: TextTheme.normal.fontSize,
    fontWeight: FontWeights.bold,
    textAlign: 'center' as const,
  },
  documentIconContainer: {
    backgroundColor: ColorPalette.brand.primary,
    alignSelf: 'flex-start' as const,
    padding: Spacing.xxxs,
    borderRadius: BorderRadius.extraSmall,
    marginBottom: Spacing.xs,
  },
  documentIcon: {
    color: ColorPalette.grayscale.white,
  },
}

const OnboardingTheme = {
  container: {
    backgroundColor: ColorPalette.brand.primaryBackground,
  },
  carouselContainer: {
    backgroundColor: ColorPalette.brand.primaryBackground,
  },
  pagerDot: {
    borderColor: ColorPalette.brand.primary,
  },
  pagerDotActive: {
    color: ColorPalette.brand.primary,
  },
  pagerDotInactive: {
    color: ColorPalette.brand.primaryDisabled,
  },
  pagerNavigationButton: {
    color: ColorPalette.brand.primary,
    fontWeight: FontWeights.bold,
    fontSize: TextTheme.normal.fontSize,
  },
  headerTintColor: ColorPalette.brand.headerIcon,
  headerText: {
    ...TextTheme.headingTwo,
    color: ColorPalette.notification.infoText,
  },
  bodyText: {
    ...TextTheme.normal,
    color: ColorPalette.notification.infoText,
  },
  imageDisplayOptions: {
    fill: ColorPalette.notification.infoText,
  },
}

const DialogTheme = {
  modalView: {
    backgroundColor: ColorPalette.brand.secondaryBackground,
  },
  titleText: {
    color: ColorPalette.grayscale.white,
  },
  description: {
    color: ColorPalette.grayscale.white,
  },
  closeButtonIcon: {
    color: ColorPalette.grayscale.white,
  },
  carouselButtonText: {
    color: ColorPalette.grayscale.white,
  },
}

const LoadingTheme = {
  backgroundColor: ColorPalette.brand.primaryBackground,
}

const PINEnterTheme = {
  image: {
    alignSelf: 'center' as const,
    marginBottom: Spacing.md,
  },
}

const PINInputTheme: IPINInputTheme = {
  cell: {
    backgroundColor: ColorPalette.grayscale.lightGrey,
    borderColor: ColorPalette.grayscale.lightGrey,
  },
  focussedCell: {
    borderColor: '#3399FF',
  },
  cellText: {
    color: ColorPalette.brand.primary,
  },
  icon: {
    color: ColorPalette.brand.primary,
  },
  codeFieldRoot: {
    justifyContent: 'flex-start',
    alignItems: 'center',
  },
  labelAndFieldContainer: {
    flexDirection: 'row',
    borderRadius: 5,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xxxs,
    alignItems: 'center',
    backgroundColor: ColorPalette.grayscale.lightGrey,
    borderColor: ColorPalette.grayscale.lightGrey,
  },
}

const SeparatedPINInputTheme: ISeparatedPINInputTheme = {
  cell: {
    backgroundColor: ColorPalette.grayscale.lightGrey,
    borderColor: ColorPalette.grayscale.lightGrey,
    borderWidth: 1,
    margin: 6,
    borderRadius: BorderRadius.extraSmall,
    flex: 1,
    flexShrink: 0,
  },
  focussedCell: {
    borderColor: '#3399FF',
  },
  cellText: {
    color: ColorPalette.brand.primary,
  },
  icon: {
    color: ColorPalette.brand.primary,
  },
  codeFieldRoot: {
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  labelAndFieldContainer: {
    flexDirection: 'row',
    paddingHorizontal: 0,
    paddingVertical: Spacing.xxxs,
    alignItems: 'center',
  },
}

const CredentialCardShadowTheme: ViewStyle = {
  shadowColor: '#000',
  shadowOffset: { width: 1, height: 1 },
  shadowOpacity: 0.3,
}

const SelectedCredTheme: ViewStyle = {
  borderWidth: 5,
  borderRadius: 15,
  borderColor: ColorPalette.semantic.focus,
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

const InputInlineMessage: IInlineInputMessage = {
  inlineErrorText: {
    ...TextTheme.inlineErrorText,
  },
  InlineErrorIcon: Assets.svg.iconError,
  inlineWarningText: {
    ...TextTheme.inlineWarningText,
  },
  InlineWarningIcon: Assets.svg.iconWarning,
}

const PaperThemeConfig: PaperTheme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    error: ColorPalette.semantic.error,
  },
}

const defaultBorderRadius = 4
const defaultBorderWidth = 2

export const theme: HekaTheme = {
  themeName: 'heka',
  ColorPalette,
  IconSizes,
  Spacing,
  HekaTextTheme: HekaTextTheme,
  TextTheme,
  InputInlineMessage,
  FontWeights,
  Buttons,
  heavyOpacity,
  BorderRadius,
  borderRadius: defaultBorderRadius,
  BorderWidth,
  borderWidth: defaultBorderWidth,
  maxFontSizeMultiplier,
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
  SeparatedPINInputTheme,
  CredentialCardShadowTheme,
  SelectedCredTheme,
  Assets,
  PaperTheme: PaperThemeConfig,
}

export const useHekaTheme = (): HekaTheme => {
  return useTheme() as unknown as HekaTheme
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
      backgroundColor: ColorPalette.grayscale.darkGrey,
      borderRadius: BorderRadius.bigger,
      borderColor: ColorPalette.grayscale.inactiveGray,
      padding: Spacing.xxl,
      alignItems: 'center',
      shadowColor: ColorPalette.grayscale.black,
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
      backgroundColor: `${ColorPalette.grayscale.mediumGrey}33`,
      borderRadius: BorderRadius.small,
      borderColor: 'transparent',
      padding: Spacing.md,
    },
  })
}
