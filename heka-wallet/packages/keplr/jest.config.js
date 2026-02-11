// eslint-disable-next-line @typescript-eslint/no-var-requires
const baseConfig = require('../../jest-helpers/jest.config-base')

// eslint-disable-next-line no-undef
module.exports = {
  ...baseConfig,
  setupFiles: ['../../jest.setup.js'],
  roots: ['<rootDir>', '../../jest-helpers'],
  transform: {
    '^.+\\.(js|jsx|ts|tsx)$': ['babel-jest', { configFile: '../../babel.config.js' }],
  },
}
