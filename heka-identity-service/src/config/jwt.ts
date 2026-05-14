import { registerAs } from '@nestjs/config'
import { JwtModuleOptions } from '@nestjs/jwt'

export default registerAs('jwt', (): JwtModuleOptions => {
  const secret = process.env.JWT_SECRET
  if (!secret || secret.length < 32) {
    throw new Error(
      '[heka-identity-service] JWT_SECRET env var must be set to a random string of at least 32 characters. ' +
        "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
    )
  }

  return {
    secret,
    verifyOptions: {
      issuer: process.env.JWT_VERIFY_OPTIONS_ISSUER || 'Heka',
      audience: process.env.JWT_VERIFY_OPTIONS_AUDIENCE || 'Heka Identity Service',
    },
  }
})
