import { Secret, sign, SignOptions } from 'jsonwebtoken'

import { Role } from 'src/common/auth'

export function signJwt(
  payload: string | Buffer | object,
  secretOrPrivateKey: Secret,
  options: SignOptions,
): Promise<string> {
  return new Promise((resolve, reject) => {
    sign(payload, secretOrPrivateKey, options, (error: Error | null, encoded: string | undefined) => {
      if (error) {
        reject(error)
      } else if (encoded !== undefined) {
        resolve(encoded)
      } else {
        reject(new Error('Unknown JWT error'))
      }
    })
  })
}

export async function createAuthToken(userId: string, role: Role, orgId?: string): Promise<string> {
  const payload: Record<string, unknown> = {
    name: userId,
    type: 'access',
    roles: [role as string],
  }

  if (orgId !== undefined) {
    payload.org_id = orgId
  }

  const secret = 'test'

  const options: SignOptions = {
    subject: userId,
    issuer: 'Heka',
    audience: 'Heka Identity Service',
    expiresIn: '1w',
  }

  return await signJwt(payload, secret, options)
}
