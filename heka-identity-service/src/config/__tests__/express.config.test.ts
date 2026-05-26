import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import expressConfig from 'config/express'

describe('express config', () => {
  let originalEnv: NodeJS.ProcessEnv

  beforeEach(() => {
    originalEnv = { ...process.env }
    delete process.env.EXPRESS_ENABLE_CORS
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

  describe('corsOptions', () => {
    it('is an empty object when EXPRESS_CORS_OPTIONS is not set', () => {
      const config = expressConfig()
      expect(config.corsOptions).toEqual({})
    })

    it('parses valid JSON from EXPRESS_CORS_OPTIONS', () => {
      process.env.EXPRESS_CORS_OPTIONS = '{"credentials":true,"maxAge":3600}'
      const config = expressConfig()
      expect(config.corsOptions).toEqual({ credentials: true, maxAge: 3600 })
    })

    it('preserves origin when set inside EXPRESS_CORS_OPTIONS', () => {
      process.env.EXPRESS_CORS_OPTIONS = '{"origin":["https://admin.example.com","https://wallet.example.com"]}'
      const config = expressConfig()
      expect(config.corsOptions.origin).toEqual(['https://admin.example.com', 'https://wallet.example.com'])
    })

    it('throws when EXPRESS_CORS_OPTIONS contains invalid JSON', () => {
      process.env.EXPRESS_CORS_OPTIONS = '{not valid json'

      expect(() => {
        expressConfig()
      }).toThrow()
    })
  })
})
