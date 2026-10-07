/** Minimal typing of the Auth0 post-login Action for the unit tests; the runtime shape is Auth0's. */
export interface PostLoginEvent {
  secrets?: Record<string, string | undefined>
  resource_server?: { identifier?: string }
  user?: {
    user_id?: string
    username?: string
    nickname?: string
    name?: string
    email?: string
    app_metadata?: Record<string, unknown>
  }
  authorization?: { roles?: string[] }
}

export interface PostLoginApi {
  accessToken: { setCustomClaim(name: string, value: unknown): void }
  idToken: { setCustomClaim(name: string, value: unknown): void }
  user: { setAppMetadata(name: string, value: unknown): void }
}

export function onExecutePostLogin(event: PostLoginEvent, api: PostLoginApi): Promise<void>
