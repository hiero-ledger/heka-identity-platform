import 'react-i18next'
import BifoldTranslation from '@bifold/core/src/localization/en'

import HekaWalletTranslation from '../localization/en'

declare module 'react-i18next' {
  interface CustomTypeOptions {
    resources: {
      translation: typeof HekaWalletTranslation & typeof BifoldTranslation
    }
  }
}
