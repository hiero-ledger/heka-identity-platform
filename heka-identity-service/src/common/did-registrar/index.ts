export { DidRegistrarModule } from './did-registrar.module'
export { DidRegistrarService } from './did-registrar.service'
export {
  DidRegistrar,
  fragmentOf,
  UpdateDidOptions,
  VerificationPurpose,
  VERIFICATION_PURPOSES,
  VERIFICATION_RELATIONSHIPS,
} from './did-registrar.types'
export {
  assertDidActive,
  assertDidActiveOnLedger,
  DID_DEACTIVATED_TAG,
  isDidRecordDeactivated,
  isStoredDidDeactivated,
} from './did-deactivation'
