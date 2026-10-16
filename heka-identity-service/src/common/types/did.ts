import { ProtocolType } from './protocol-type'

export enum DidMethod {
  Key = 'key',
  Indy = 'indy',
  IndyBesu = 'indybesu',
  Hedera = 'hedera',
}

// DID method whose DID is persisted as `Wallet.publicDid`: the wallet's primary DID and the DID
// checked by the controller prerequisite. It is also the method used when a request names none.
export const MAIN_DID_METHOD = DidMethod.Key

export const didMethods: Record<ProtocolType, Array<DidMethod>> = {
  [ProtocolType.Aries]: [DidMethod.Indy, DidMethod.IndyBesu, DidMethod.Hedera],
  [ProtocolType.Oid4vc]: [DidMethod.Key, DidMethod.IndyBesu, DidMethod.Hedera],
}
