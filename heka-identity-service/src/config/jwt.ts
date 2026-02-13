import { registerAs } from '@nestjs/config'
import { JwtModuleOptions } from '@nestjs/jwt'

export default registerAs(
  'jwt',
  (): JwtModuleOptions => ({
    secret: process.env.JWT_SECRET || 'test',
    verifyOptions: {
      issuer: process.env.JWT_VERIFY_OPTIONS_ISSUER || 'Heka',
      audience: process.env.JWT_VERIFY_OPTIONS_AUDIENCE || 'Heka Identity Service',
    },
  }),
)
