// eslint-disable-next-line no-undef
module.exports = {
  preset: '@testing-library/react-native',
  testTimeout: 10000,
  setupFiles: ['<rootDir>/jest.setup.js'],
  setupFilesAfterEnv: ['@testing-library/jest-native/extend-expect'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  transform: {
    '^.+\\.(js|jsx|ts|tsx)$': 'babel-jest',
  },
  transformIgnorePatterns: ['node_modules/(?!.*react-native|@hyperledger/aries-bifold-core.*)'],
  testRegex: '(/__tests__/.*(\\.|/)(test|spec))\\.[jt]sx?$',
  testPathIgnorePatterns: ['\\.snap$', '<rootDir>/node_modules/', './node_modules/'],
  cacheDirectory: '.jest/cache',
  clearMocks: true,
  moduleNameMapper: {
    // Force module uuid to resolve with the CJS entry point, because Jest does not support package.json.exports.
    // See https://github.com/uuidjs/uuid/issues/451
    '^uuid$': require.resolve('uuid'),
  },
}
