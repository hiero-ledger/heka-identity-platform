// Mock for @heka-wallet/shared — provides utility functions used in keplr tests
// without pulling in the full theme/component tree that requires native modules
module.exports = {
  __esModule: true,
  tryParseInt: (str) => {
    const n = parseInt(str, 10)
    return isNaN(n) ? undefined : n
  },
  useHekaTheme: jest.fn(() => ({})),
  useGlobalStyles: jest.fn(() => ({})),
  usePrevious: jest.fn(),
  getHostNameFromUrl: jest.fn((url) => {
    try {
      return new URL(url).hostname
    } catch {
      return url
    }
  }),
  sanitizeString: jest.fn((s) => s),
}
