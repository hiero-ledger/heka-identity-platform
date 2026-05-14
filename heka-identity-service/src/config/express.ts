import { registerAs } from '@nestjs/config'

// CWE-20: Validate CORS options from env — never allow origin: true or origin: '*'
const ALLOWED_CORS_FIELDS = ['origin', 'methods', 'allowedHeaders', 'exposedHeaders', 'credentials', 'maxAge']

function parseCorsOptions(raw: string): Record<string, unknown> {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    console.warn('EXPRESS_CORS_OPTIONS is not valid JSON — using default CORS config')
    return {}
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    console.warn('EXPRESS_CORS_OPTIONS must be a JSON object — using default CORS config')
    return {}
  }
  const obj = parsed as Record<string, unknown>
  if (obj.origin === true || obj.origin === '*') {
    console.warn('EXPRESS_CORS_OPTIONS contains unsafe origin value — using default CORS config')
    return {}
  }
  return Object.fromEntries(
    Object.entries(obj).filter(([key]) => ALLOWED_CORS_FIELDS.includes(key))
  )
}

export default registerAs('express', () => {
  const port = process.env.EXPRESS_PORT || 3000
  const host = process.env.EXPRESS_HOST || 'localhost'
  const prefix = process.env.EXPRESS_PREFIX
  const appEndpoint = process.env.APP_ENDPOINT ?? `http://${host}:${port}${prefix ? `/${prefix}` : ''}`

  const enableCors = process.env.EXPRESS_ENABLE_CORS === 'true'

  const corsOptions = process.env.EXPRESS_CORS_OPTIONS
    ? parseCorsOptions(process.env.EXPRESS_CORS_OPTIONS)
    : {}

  return {
    port,
    host,
    appEndpoint,
    prefix,
    enableCors,
    corsOptions,
  }
})
