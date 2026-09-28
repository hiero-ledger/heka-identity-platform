// The contributor-onboarding OAuth flow and GPG challenge live in heka-auth-service.
// The Identity Service retains read-only entity access to look up contributor bindings
// during SD-JWT VC issuance (contributor-credential module).
export { ContributorBinding } from './contributor-binding.entity'
export { ContributorAuditEvent, ContributorAuditEventType } from './contributor-audit-event.entity'
