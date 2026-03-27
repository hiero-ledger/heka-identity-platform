// eslint-disable-next-line no-undef
module.exports = {
  preset: 'react-native',
  testTimeout: 10000,
  setupFiles: ['<rootDir>/jest.setup.js'],
  setupFilesAfterEnv: ['@testing-library/jest-native/extend-expect'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'mjs', 'json', 'node'],
  transform: {
    '^.+\\.(js|jsx|ts|tsx|mjs)$': 'babel-jest',
  },
  transformIgnorePatterns: [
    'node_modules/(?!(react-native|@react-native|react-native-confirmation-code-field|react-native-fingerprint-scanner|react-native-config)/)',
  ],
  testRegex: '(/__tests__/.*(\\.|/)(test|spec))\\.[jt]sx?$',
  testPathIgnorePatterns: ['\\.snap$', '<rootDir>/node_modules/', './node_modules/'],
  cacheDirectory: '.jest/cache',
  clearMocks: true,
  moduleNameMapper: {
    // Force module uuid to resolve with the CJS entry point, because Jest does not support package.json.exports.
    // See https://github.com/uuidjs/uuid/issues/451
    '^uuid$': require.resolve('uuid'),
    // eslint-disable-next-line @typescript-eslint/no-var-requires, no-undef
    '^@bifold/core$': require('path').resolve(__dirname, '__mocks__/bifold-core.js'),
    // eslint-disable-next-line @typescript-eslint/no-var-requires, no-undef
    '^@bifold/core/src/(.*)$': require('path').resolve(__dirname, '__mocks__/bifold-core-src.js'),
  },
}
