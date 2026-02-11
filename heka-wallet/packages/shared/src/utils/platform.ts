import { Platform } from 'react-native'

import { IconName } from '../components/icons'

export const platformBackIconConfig = Platform.select<{ name: IconName; size: number }>({
  ios: { name: 'chevron-left', size: 38 },
  default: { name: 'arrow-left', size: 24 },
})
