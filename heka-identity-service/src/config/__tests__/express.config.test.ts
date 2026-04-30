import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import expressConfig from 'config/express'

describe('express config', () => {
  let originalEnv: NodeJS.ProcessEnv

  beforeEach(() => {
    originalEnv = { ...process.env }
    // Clear all CORS-related env vars before each test
    delete process.env.EXPRESS_ENABLE_CORS
    delete process.env.EXPRESS_ALLOWED_ORIGINS
    delete process.env.EXPRESS_CORS_OPTIONS
  })

  afterEach(() => {
    process.env = originalEnv
  })

  describe('enableCors', () => {
    it('defaults to false when EXPRESS_ENABLE_CORS is not set', () => {
      const config = expressConfig()
      expect(config.enableCors).toBe(false)
    })

    it('is true when EXPRESS_ENABLE_CORS=true', () => {
      process.env.EXPRESS_ENABLE_CORS = 'true'
      const config = expressConfig()
      expect(config.enableCors).toBe(true)
    })

    it('is false when EXPRESS_ENABLE_CORS=false', () => {
      process.env.EXPRESS_ENABLE_CORS = 'false'
      const config = expressConfig()
      expect(config.enableCors).toBe(false)
    })

    it('is false for any value other than "true"', () => {
      process.env.EXPRESS_ENABLE_CORS = '1'
      const config = expressConfig()
      expect(config.enableCors).toBe(false)
    })
  })

  describe('corsOptions.origin', () => {
    it('is an empty array when EXPRESS_ALLOWED_ORIGINS is not set', () => {
      const config = expressConfig()
      expect(config.corsOptions.origin).toEqual([])
    })

    it('parses a single origin correctly', () => {
      process.env.EXPRESS_ALLOWED_ORIGINS = 'https://admin.example.com'
      const config = expressConfig()
      expect(config.corsOptions.origin).toEqual(['https://admin.example.com'])
    })

    it('parses comma-separated origins into an array', () => {
      process.env.EXPRESS_ALLOWED_ORIGINS = 'https://admin.example.com,https://wallet.example.com'
      const config = expressConfig()
      expect(config.corsOptions.origin).toEqual(['https://admin.example.com', 'https://wallet.example.com'])
    })

    it('trims whitespace around each origin', () => {
      process.env.EXPRESS_ALLOWED_ORIGINS = '  https://admin.example.com , https://wallet.example.com  '
      const config = expressConfig()
      expect(config.corsOptions.origin).toEqual(['https://admin.example.com', 'https://wallet.example.com'])
    })

    it('filters out empty entries from trailing commas', () => {
      process.env.EXPRESS_ALLOWED_ORIGINS = 'https://admin.example.com,,https://wallet.example.com,'
      const config = expressConfig()
      expect(config.corsOptions.origin).toEqual(['https://admin.example.com', 'https://wallet.example.com'])
    })
  })

  describe('corsOptions', () => {
    it('is an object with only origin when EXPRESS_CORS_OPTIONS is not set', () => {
      const config = expressConfig()
      expect(config.corsOptions).toEqual({ origin: [] })
    })

    it('parses valid JSON from EXPRESS_CORS_OPTIONS and includes origin', () => {
      process.env.EXPRESS_CORS_OPTIONS = '{"credentials":true,"maxAge":3600}'
      const config = expressConfig()
      expect(config.corsOptions).toEqual({ credentials: true, maxAge: 3600, origin: [] })
    })

    it('throws when EXPRESS_CORS_OPTIONS contains invalid JSON', () => {
      process.env.EXPRESS_CORS_OPTIONS = '{not valid json'

      expect(() => {
        expressConfig()
      }).toThrow()
    })
  })
})
