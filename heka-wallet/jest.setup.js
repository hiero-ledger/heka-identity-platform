/* eslint-disable no-undef,import/no-extraneous-dependencies */
import 'reflect-metadata'
import 'react-native-gesture-handler/jestSetup'
import mockAsyncStorage from '@react-native-async-storage/async-storage/jest/async-storage-mock'
import mockRNCNetInfo from '@react-native-community/netinfo/jest/netinfo-mock'
import mockRNPermissions from 'react-native-permissions/mock'

import mockLogger from './jest-helpers/__mocks__/logger'

jest.mock('react-native/Libraries/Animated/NativeAnimatedHelper')
jest.mock('react-native/Libraries/EventEmitter/NativeEventEmitter')
jest.mock('react-native/Libraries/Linking/Linking')
jest.mock('axios')
jest.mock('@react-native-async-storage/async-storage', () => mockAsyncStorage)
jest.mock('@react-native-community/netinfo', () => mockRNCNetInfo)
jest.mock('react-native-permissions', () => mockRNPermissions)

// 'requireActual' call is a workaround for imports related issue with Jest
// See https://github.com/react-native-camera/react-native-camera/issues/921
jest.mock('react-native-keychain', () => jest.requireActual('./jest-helpers/__mocks__/react-native-keychain').default)

jest.mock('./packages/shared/src/logger/Logger.ts', () => mockLogger)

// Workaround to resolve errors related to leaking imports from shared package
// TODO: Find a good way to handle this (proper mocking of shared package, update for export approach)
jest.mock('@hyperledger/aries-bifold-core', () => jest.fn())
jest.mock('@hyperledger/aries-bifold-core/App/utils/crypto', () => jest.fn())
jest.mock('@react-navigation/elements', () => jest.fn())
