/* eslint-disable @typescript-eslint/no-unused-vars */
import { i18nBuilder } from 'keycloakify/login'
import type { ThemeName } from '../kc.gen'

/**
 * @see: https://docs.keycloakify.dev/features/i18n
 *
 * Only one custom message: the identity line under the login card that tells
 * the user they are at the identity provider, not the application.
 * `{0}` = realm display name, `{1}` = application name.
 */
const { useI18n, ofTypeI18n } = i18nBuilder
  .withThemeName<ThemeName>()
  .withCustomTranslations({
    en: {
      hekaIdentityNote: 'You are signing in through {0}, the identity provider for {1}.',
    },
  })
  .build()

type I18n = typeof ofTypeI18n

export { useI18n, type I18n }
