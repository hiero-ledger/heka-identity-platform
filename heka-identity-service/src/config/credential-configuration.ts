import { OpenId4VciCredentialFormatProfile } from '@credo-ts/openid4vc'

import { AriesCredentialFormat, ProtocolType } from 'common/types'

export type NetworkType = 'key' | 'indy' | 'indybesu' | 'hedera'

export interface CredentialConfigData {
  credentials: AriesCredentialFormat[] | OpenId4VciCredentialFormatProfile[]
  networks: NetworkType[]
}

export type CredentialsConfiguration = {
  [key in ProtocolType]: CredentialConfigData
}
