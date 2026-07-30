import { registerAs } from '@nestjs/config'
import { JwtModuleOptions } from '@nestjs/jwt'

export default registerAs(
  'jwt',
  (): JwtModuleOptions => ({
    secret: (() => {
      const secret = process.env.JWT_SECRET
      if (!secret) {
        throw new Error('JWT_SECRET environment variable is required')
      }
      if (secret.length < 32) {
        throw new Error('JWT_SECRET must be at least 32 characters long')
      }
      return secret
    })(),
    verifyOptions: {
      issuer: process.env.JWT_VERIFY_OPTIONS_ISSUER || 'Heka',
      audience: process.env.JWT_VERIFY_OPTIONS_AUDIENCE || 'Heka Identity Service',
    },
  }),
)
