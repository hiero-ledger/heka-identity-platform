const keychainModule = jest.requireActual('react-native-keychain')

export default {
  ...keychainModule,
  setGenericPassword: jest.fn(() => Promise.resolve('mockPass')),
  getGenericPassword: jest.fn(() => Promise.resolve({ password: JSON.stringify('mockPass') })),
  resetGenericPassword: jest.fn(() => Promise.resolve(null)),
}
