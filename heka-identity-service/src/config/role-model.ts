import { registerAs } from '@nestjs/config'

export default registerAs('roleModel', () => ({
  // Whether role restrictions are enforced. Roles and wallets are the same either way.
  enabled: process.env.ROLE_MODEL_ENABLED?.toLowerCase() === 'true',
}))
