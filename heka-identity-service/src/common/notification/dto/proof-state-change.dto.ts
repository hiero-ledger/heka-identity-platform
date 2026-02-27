import { DidCommProofEventTypes, DidCommProofExchangeRecord, DidCommProofState, DidCommProofStateChangedEvent } from '@credo-ts/didcomm'

export class ProofStateChangeDetailsDto {
  public connectionId?: string
  public threadId: string
  public isVerified?: boolean
  public errorMessage?: string

  public constructor(record: DidCommProofExchangeRecord) {
    this.connectionId = record.connectionId
    this.threadId = record.threadId
    this.isVerified = record.isVerified
    this.errorMessage = record.errorMessage
  }
}

export class ProofStateChangeDto {
  public id: string
  public type: DidCommProofEventTypes
  public state: DidCommProofState
  public details: ProofStateChangeDetailsDto

  public constructor(event: DidCommProofStateChangedEvent) {
    const { proofRecord } = event.payload
    this.id = proofRecord.id
    this.type = event.type
    this.state = proofRecord.state
    this.details = new ProofStateChangeDetailsDto(proofRecord)
  }
}
