import { translationResources } from '@hyperledger/aries-bifold-core'
import merge from 'lodash.merge'

import en from './localization/en'
import fr from './localization/fr'
import ptBr from './localization/pt-br'

export { RootStoreProvider } from './contexts'

export const localization = merge({}, translationResources, {
  en: { translation: en },
  fr: { translation: fr },
  'pt-BR': {
    translation: ptBr,
  },
})
