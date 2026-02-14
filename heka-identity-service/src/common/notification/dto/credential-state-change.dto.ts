import {
  CredentialEventTypes,
  CredentialExchangeRecord,
  CredentialState,
  CredentialStateChangedEvent,
  RevocationNotificationReceivedEvent,
} from '@credo-ts/didcomm'

import { CredentialPreviewAttributeDto } from 'credential/dto'

export class CredentialStateChangeDetailsDto {
  public connectionId?: string
  public threadId: string
  public errorMessage?: string
  public credentialAttributes?: CredentialPreviewAttributeDto[]

  public constructor(record: CredentialExchangeRecord) {
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
  public type: CredentialEventTypes
  public state: CredentialState
  public details: CredentialStateChangeDetailsDto

  public constructor(event: CredentialStateChangedEvent | RevocationNotificationReceivedEvent) {
    const { credentialRecord } = event.payload
    this.id = credentialRecord.id
    this.type = event.type
    this.state = credentialRecord.state
    this.details = new CredentialStateChangeDetailsDto(credentialRecord)
  }
}
