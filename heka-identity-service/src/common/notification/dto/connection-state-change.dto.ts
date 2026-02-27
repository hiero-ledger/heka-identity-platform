import {
  DidCommConnectionEventTypes,
  DidCommConnectionRecord,
  DidCommConnectionStateChangedEvent,
  DidCommDidExchangeState,
  DidCommConnectionDidRotatedEvent,
} from '@credo-ts/didcomm'

export class ConnectionStateChangeDetailsDto {
  public threadId?: string
  public did?: string
  public theirDid?: string
  public theirLabel?: string
  public alias?: string
  public imageUrl?: string
  public errorMessage?: string
  public invitationDid?: string

  public constructor(record: DidCommConnectionRecord) {
    this.threadId = record.threadId
    this.did = record.did
    this.theirDid = record.theirDid
    this.theirLabel = record.theirLabel
    this.alias = record.alias
    this.imageUrl = record.imageUrl
    this.errorMessage = record.errorMessage
    this.invitationDid = record.invitationDid
  }
}

export class ConnectionStateChangeDto {
  public id: string
  public type: DidCommConnectionEventTypes
  public state: DidCommDidExchangeState
  public details: ConnectionStateChangeDetailsDto

  public constructor(event: DidCommConnectionStateChangedEvent | DidCommConnectionDidRotatedEvent) {
    const { connectionRecord } = event.payload
    this.id = connectionRecord.id
    this.type = event.type
    this.state = connectionRecord.state
    this.details = new ConnectionStateChangeDetailsDto(connectionRecord)
  }
}
