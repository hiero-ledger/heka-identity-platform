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

/** What a log line may carry of a notification: its records can hold offer secrets and personal data. */
export function notificationLogContext(notification: NotificationDto): { type: string; id: string } {
  if ('issuanceSession' in notification) return { type: notification.type, id: notification.issuanceSession.id }
  if ('verificationSession' in notification) return { type: notification.type, id: notification.verificationSession.id }
  return { type: notification.type, id: notification.id }
}
