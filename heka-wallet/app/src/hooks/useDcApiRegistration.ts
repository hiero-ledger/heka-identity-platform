import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Platform } from 'react-native'

import { useMdocRecords, useSdJwtVcRecords } from '../contexts'
import { dcApiRegisterCredentials } from '../credentials/dcApi'
import { useHekaAgent } from '../utils/agent'

// Debounce so a burst of record changes (e.g. batch issuance) triggers a single registration.
const REGISTER_DEBOUNCE_MS = 500

/**
 * Keeps the Android Credential Manager registry in sync with the wallet's credentials for the
 * Digital Credentials API. Re-registers whenever the agent becomes available (unlock) or the mdoc /
 * SD-JWT VC record sets change (issuance, deletion). No-op on iOS.
 */
export function useDcApiRegistration(): void {
  const { t } = useTranslation()
  const { agent } = useHekaAgent()
  const { mdocCredentialRecords, isLoading: isMdocLoading } = useMdocRecords()
  const { sdJwtVcRecords, isLoading: isSdJwtLoading } = useSdJwtVcRecords()

  useEffect(() => {
    if (Platform.OS !== 'android' || !agent || isMdocLoading || isSdJwtLoading) {
      return
    }

    const handle = setTimeout(() => {
      void dcApiRegisterCredentials(agent, {
        labels: {
          titleFallback: t('DigitalCredentials.CredentialTitleFallback'),
          subtitle: (issuerName: string) => t('DigitalCredentials.IssuedBy', { issuer: issuerName }),
          subtitleFallback: t('DigitalCredentials.UnknownIssuer'),
        },
      })
    }, REGISTER_DEBOUNCE_MS)

    return () => clearTimeout(handle)
  }, [agent, mdocCredentialRecords, sdJwtVcRecords, isMdocLoading, isSdJwtLoading, t])
}
