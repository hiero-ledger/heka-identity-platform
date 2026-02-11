// eslint-disable-next-line @typescript-eslint/no-var-requires
const baseConfig = require('./jest-helpers/jest.config-base')

const getTestRegexForPath = (path) => `(${path}/__tests__/.*(\\.|/)(test|spec))\\.[jt]sx?$`

module.exports = {
  projects: [
    {
      ...baseConfig,
      displayName: 'heka-ssi-wallet',
      testRegex: getTestRegexForPath('app'),
    },
    {
      ...baseConfig,
      displayName: '@heka-wallet/shared',
      testRegex: getTestRegexForPath('packages/shared'),
    },
    {
      ...baseConfig,
      displayName: '@heka-wallet/keplr',
      testRegex: getTestRegexForPath('packages/keplr'),
    },
  ],
}
