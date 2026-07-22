/* eslint-disable no-undef,import/no-extraneous-dependencies */
import 'reflect-metadata'
import 'react-native-gesture-handler/jestSetup'
import mockAsyncStorage from '@react-native-async-storage/async-storage/jest/async-storage-mock'
import mockRNCNetInfo from '@react-native-community/netinfo/jest/netinfo-mock'
import mockRNPermissions from 'react-native-permissions/mock'

import mockLogger from './jest-helpers/__mocks__/logger'

jest.mock('react-native/Libraries/EventEmitter/NativeEventEmitter')
jest.mock('react-native/Libraries/Linking/Linking')
jest.mock('axios')
jest.mock('react-native-config', () => ({ Config: {} }))
jest.mock('react-native-passkey', () => ({
  Passkey: { register: jest.fn(), authenticate: jest.fn(), isSupported: jest.fn(() => true) },
}))
jest.mock('react-native-passkey/lib/typescript/Passkey', () => ({}), { virtual: true })
jest.mock('react-native-user-identity', () => ({ default: jest.fn() }))
jest.mock('@react-native-async-storage/async-storage', () => mockAsyncStorage)
jest.mock('@react-native-community/netinfo', () => mockRNCNetInfo)
jest.mock('react-native-permissions', () => mockRNPermissions)

// 'requireActual' call is a workaround for imports related issue with Jest
// See https://github.com/react-native-camera/react-native-camera/issues/921
jest.mock('react-native-keychain', () => jest.requireActual('./jest-helpers/__mocks__/react-native-keychain').default)

jest.mock('./packages/shared/src/logger/Logger.ts', () => mockLogger)

// @bifold/core is mocked via moduleNameMapper in jest.config-base.js
jest.mock('@react-navigation/elements', () => ({
  __esModule: true,
  default: jest.fn(),
}))

// Mock @credo-ts packages to avoid ESM parsing issues in Jest
jest.mock('@credo-ts/core', () => ({
  __esModule: true,
  Kms: {
    KnownJwaSignatureAlgorithms: { EdDSA: 'EdDSA', ES256: 'ES256' },
    PublicJwk: { fromUnknown: jest.fn() },
  },
  ClaimFormat: { MsoMdoc: 'mso_mdoc', SdJwtDc: 'dc+sd-jwt' },
  CredentialMultiInstanceUseMode: { NewOrFirst: 'NewOrFirst' },
  DidJwk: { fromDid: jest.fn(() => ({ verificationMethodId: 'mock-vm-id' })) },
  DidKey: { fromDid: jest.fn(() => ({ did: 'did:key:mock', publicJwk: { fingerprint: 'mock-fp' } })) },
  Agent: jest.fn(),
  DifPexCredentialsForRequest: {},
}))
jest.mock('@credo-ts/openid4vc', () => ({
  __esModule: true,
  OpenId4VciCredentialFormatProfile: { SdJwtVc: 'vc+sd-jwt' },
  OpenId4VciAuthorizationFlow: {
    Oauth2Redirect: 'Oauth2Redirect',
    PresentationDuringIssuance: 'PresentationDuringIssuance',
  },
  getOfferedCredentials: jest.fn((ids, configs) => {
    const result = {}
    for (const id of ids) {
      if (configs[id]) result[id] = configs[id]
    }
    return Object.keys(result).length > 0 ? result : undefined
  }),
}))
jest.mock('@credo-ts/didcomm', () => ({ __esModule: true }))
jest.mock('@credo-ts/react-native', () => ({ __esModule: true, agentDependencies: {} }))
