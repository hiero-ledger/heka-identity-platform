import { ProofEventTypes, ProofExchangeRecord, ProofState, ProofStateChangedEvent } from '@credo-ts/didcomm'

export class ProofStateChangeDetailsDto {
  public connectionId?: string
  public threadId: string
  public isVerified?: boolean
  public errorMessage?: string

  public constructor(record: ProofExchangeRecord) {
    this.connectionId = record.connectionId
    this.threadId = record.threadId
    this.isVerified = record.isVerified
    this.errorMessage = record.errorMessage
  }
}

export class ProofStateChangeDto {
  public id: string
  public type: ProofEventTypes
  public state: ProofState
  public details: ProofStateChangeDetailsDto

  public constructor(event: ProofStateChangedEvent) {
    const { proofRecord } = event.payload
    this.id = proofRecord.id
    this.type = event.type
    this.state = proofRecord.state
    this.details = new ProofStateChangeDetailsDto(proofRecord)
  }
}
