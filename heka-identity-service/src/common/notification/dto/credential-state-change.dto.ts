import {
  DidCommCredentialEventTypes,
  DidCommCredentialExchangeRecord,
  DidCommCredentialState,
  DidCommCredentialStateChangedEvent,
  DidCommRevocationNotificationReceivedEvent,
} from '@credo-ts/didcomm'

import { CredentialPreviewAttributeDto } from 'credential/dto'

export class CredentialStateChangeDetailsDto {
  public connectionId?: string
  public threadId: string
  public errorMessage?: string
  public credentialAttributes?: CredentialPreviewAttributeDto[]

  public constructor(record: DidCommCredentialExchangeRecord) {
    this.connectionId = record.connectionId
    this.threadId = record.threadId
    this.errorMessage = record.errorMessage
    this.credentialAttributes = record.credentialAttributes?.map(
      (attribute) => new CredentialPreviewAttributeDto(attribute),
    )
  }
}

export class CredentialStateChangeDto {
  public id: string
  public type: DidCommCredentialEventTypes
  public state: DidCommCredentialState
  public details: CredentialStateChangeDetailsDto

  public constructor(event: DidCommCredentialStateChangedEvent | DidCommRevocationNotificationReceivedEvent) {
    const { credentialExchangeRecord } = event.payload
    this.id = credentialExchangeRecord.id
    this.type = event.type
    this.state = credentialExchangeRecord.state
    this.details = new CredentialStateChangeDetailsDto(credentialExchangeRecord)
  }
}
