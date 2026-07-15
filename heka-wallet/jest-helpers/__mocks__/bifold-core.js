// Mock for @bifold/core top-level import
// Used via moduleNameMapper to ensure consistent mocking across workspace packages
module.exports = {
  __esModule: true,
  default: {},
  useAuth: jest.fn(() => ({})),
  useTheme: jest.fn(() => ({})),
  getAgentModules: jest.fn(() => ({})),
  ImageAssets: { svg: {} },
  BifoldAgent: jest.fn(),
  testIdWithKey: (key) => key,
}
