export interface TokenPayload {
  sub: string
  roles: string[]
  org_id?: string
  name: string
}
