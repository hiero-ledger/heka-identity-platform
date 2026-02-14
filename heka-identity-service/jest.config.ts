import type { Config } from 'jest'

const config: Config = {
  moduleDirectories: ['node_modules', 'src', '../heka-identity-service'],
  moduleFileExtensions: ['ts', 'js', 'json', 'node'],
  testMatch: ['**/?(*.)+(spec|test).[jt]s'],
  testTimeout: 1200000,
  transform: {
    '\\.[jt]s$': 'ts-jest',
  },
  verbose: true,
}

export default config
