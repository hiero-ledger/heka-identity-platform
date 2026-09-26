import { registerAs } from '@nestjs/config'
import { JwtModuleOptions } from '@nestjs/jwt'

import { INSECURE_DEFAULTS } from './insecure-defaults'

export default registerAs(
  'jwt',
  (): JwtModuleOptions => ({
    secret: process.env.JWT_SECRET || INSECURE_DEFAULTS.JWT_SECRET,
    verifyOptions: {
      issuer: process.env.JWT_VERIFY_OPTIONS_ISSUER || 'Heka',
      audience: process.env.JWT_VERIFY_OPTIONS_AUDIENCE || 'Heka Identity Service',
    },
  }),
)
