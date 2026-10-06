/** Minimal typing of the Auth0 credentials-exchange Action for the unit tests; the runtime shape is Auth0's. */
export interface CredentialsExchangeEvent {
  secrets?: Record<string, string | undefined>
  resource_server?: { identifier?: string }
  client?: { client_id?: string; name?: string; metadata?: Record<string, string | undefined> }
}

export interface CredentialsExchangeApi {
  accessToken: { setCustomClaim(name: string, value: unknown): void }
  access: { deny(code: string, reason: string): void }
}

export function onExecuteCredentialsExchange(event: CredentialsExchangeEvent, api: CredentialsExchangeApi): Promise<void>
