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
  moduleNameMapper: {
    ...baseConfig.moduleNameMapper,
    // Keplr only uses utility functions from shared — mock to avoid pulling in UI/theme deps
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    '^@heka-wallet/shared$': require('path').resolve(__dirname, '../../jest-helpers/__mocks__/heka-wallet-shared.js'),
  },
}
