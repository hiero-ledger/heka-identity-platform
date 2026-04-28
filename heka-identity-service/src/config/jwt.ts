import { registerAs } from '@nestjs/config'
import { JwtModuleOptions } from '@nestjs/jwt'

import { valueOrDefaultWithWarning } from './secret-default-warning'

export default registerAs(
  'jwt',
  (): JwtModuleOptions => ({
    secret: valueOrDefaultWithWarning('JWT_SECRET', 'test', 'JWT signing secret'),
    verifyOptions: {
      issuer: process.env.JWT_VERIFY_OPTIONS_ISSUER || 'Heka',
      audience: process.env.JWT_VERIFY_OPTIONS_AUDIENCE || 'Heka Identity Service',
    },
  }),
)
