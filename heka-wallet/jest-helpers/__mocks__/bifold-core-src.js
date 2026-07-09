module.exports = {
  __esModule: true,
  default: {},
  minPINLength: 6,
  testIdWithKey: (key) => key,
  storeWalletSecret: jest.fn(),
  getCredentialIdentifiers: jest.fn(() => ({})),
  i18n: { language: 'en' },
  KeychainServices: {},
}
