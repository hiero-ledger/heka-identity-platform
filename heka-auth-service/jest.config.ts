import type { Config } from 'jest'

const config: Config = {
  moduleDirectories: ['node_modules', 'src'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  testMatch: ['**/?(*.)+(spec|test).[jt]s'],
  testTimeout: 1200000,
  transform: {
    '\\.[jt]s$': 'ts-jest',
  },
  verbose: true,
  moduleNameMapper: {
    '@core/(.*)': '<rootDir>/src/core/$1',
    '@common/(.*)': '<rootDir>/src/common/$1',
    '@config': '<rootDir>/src/core/config',
    '@utils': '<rootDir>/src/common/utils',
    '@const': '<rootDir>/src/common/const'
  },
}

export default config

