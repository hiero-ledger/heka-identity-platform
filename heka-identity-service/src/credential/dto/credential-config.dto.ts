import { ProtocolType } from 'common/types'
import { CredentialsConfiguration } from 'config/credential-configuration'

export class CredentialConfigDto {
  [key: string]: {
    credentials: string[]
    networks: string[]
  }

  public constructor(credentialsConfiguration: CredentialsConfiguration) {
    for (const key in credentialsConfiguration) {
      this[key] = { ...credentialsConfiguration[key as ProtocolType] }
    }
  }
}
