import { ConnectionStateChangeDto } from './connection-state-change.dto'
import { CredentialStateChangeDto } from './credential-state-change.dto'
import { OpenidIssueStateChangeDto } from './openid-issuer-state-change.dto'
import { OpenidVerifierStateChangeDto } from './openid-verifier-state-change.dto'
import { ProofStateChangeDto } from './proof-state-change.dto'

export { ConnectionStateChangeDto } from './connection-state-change.dto'
export { CredentialStateChangeDto } from './credential-state-change.dto'
export { ProofStateChangeDto } from './proof-state-change.dto'
export { OpenidIssueStateChangeDto } from './openid-issuer-state-change.dto'
export { OpenidVerifierStateChangeDto } from './openid-verifier-state-change.dto'

export type NotificationDto =
  | ConnectionStateChangeDto
  | CredentialStateChangeDto
  | ProofStateChangeDto
  | OpenidIssueStateChangeDto
  | OpenidVerifierStateChangeDto
