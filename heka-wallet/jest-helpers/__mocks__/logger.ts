const mockLogger = {
  trace: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}

export default {
  GlobalLogger: { ...mockLogger, createContextLogger: () => ({ ...mockLogger }) },
}
