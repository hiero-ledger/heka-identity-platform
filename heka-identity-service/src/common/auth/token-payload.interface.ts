export interface TokenPayload {
  sub: string
  roles: string[]
  org_id?: string
  name: string
  /** Expiry of the verified token, seconds since epoch; absent when the token has no `exp`. */
  exp?: number
}
