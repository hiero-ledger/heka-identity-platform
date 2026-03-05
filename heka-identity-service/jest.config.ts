import type { Config } from 'jest'

const config: Config = {
  moduleDirectories: ['node_modules', 'src', '../heka-identity-service'],
  moduleFileExtensions: ['ts', 'js', 'mjs', 'cjs', 'json', 'node'],
  testMatch: ['**/?(*.)+(spec|test).[jt]s'],
  testTimeout: 1200000,
  extensionsToTreatAsEsm: ['.ts'],
  transform: {
    '^.+\\.[jt]s$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: {
          module: 'ESNext',
          moduleResolution: 'Bundler',
        },
      },
    ],
    '^.+\\.mjs$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: {
          module: 'ESNext',
          moduleResolution: 'Bundler',
        },
      },
    ],
  },
  moduleNameMapper: {
    // Packages without index.cjs.js - use their index.js (CJS) directly
    '^@hiero-did-sdk/crypto$': '<rootDir>/node_modules/@hiero-did-sdk/crypto/dist/index.js',
    '^@hiero-did-sdk/zstd$': '<rootDir>/node_modules/@hiero-did-sdk/zstd/dist/index.js',
    // Force CJS builds for other @hiero-did-sdk packages which expose ESM via .js extension without "type":"module"
    '^@hiero-did-sdk/(.+)$': '<rootDir>/node_modules/@hiero-did-sdk/$1/dist/index.cjs.js',
  },
  transformIgnorePatterns: [
    '/node_modules/(?!(@credo-ts|@openid4vc|dcql|@noble|@sphereon|@sd-jwt|@stablelib|@digitalcredentials|uuid)/)',
  ],
  verbose: true,
}

export default config
