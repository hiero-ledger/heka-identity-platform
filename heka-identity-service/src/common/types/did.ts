import { ProtocolType } from './protocol-type'

export enum DidMethod {
  Key = 'key',
  Indy = 'indy',
  IndyBesu = 'indybesu',
  Hedera = 'hedera',
}

export const didMethods: Record<ProtocolType, Array<DidMethod>> = {
  [ProtocolType.Aries]: [DidMethod.Indy, DidMethod.IndyBesu, DidMethod.Hedera],
  [ProtocolType.Oid4vc]: [DidMethod.Key, DidMethod.IndyBesu, DidMethod.Hedera],
}
