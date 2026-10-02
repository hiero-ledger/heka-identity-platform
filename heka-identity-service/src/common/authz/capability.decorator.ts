import { SetMetadata } from '@nestjs/common'

import { Capability } from './capability'

export const CAPABILITY_KEY = 'capability'

export const RequireCapability = (capability: Capability) => SetMetadata(CAPABILITY_KEY, capability)
