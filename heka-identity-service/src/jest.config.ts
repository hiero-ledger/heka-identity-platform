import type { Config } from 'jest'

import baseConfig from '../jest.config'

const config: Config = {
  ...baseConfig,
  moduleDirectories: ['../node_modules', '../src'],
}

export default config
