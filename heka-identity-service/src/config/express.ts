import { registerAs } from '@nestjs/config'

export default registerAs('express', () => {
  const port = process.env.EXPRESS_PORT || 3000
  const host = process.env.EXPRESS_HOST || 'localhost'
  const prefix = process.env.EXPRESS_PREFIX
  const appEndpoint = process.env.APP_ENDPOINT ?? `http://${host}:${port}${prefix ? `/${prefix}` : ''}`

  const enableCors = process.env.EXPRESS_ENABLE_CORS === 'true'

  let corsOptions: Record<string, unknown> = {}
  if (process.env.EXPRESS_CORS_OPTIONS) {
    corsOptions = JSON.parse(process.env.EXPRESS_CORS_OPTIONS) as Record<string, unknown>
  }

  const allowedOrigins: string[] = process.env.EXPRESS_ALLOWED_ORIGINS
    ? process.env.EXPRESS_ALLOWED_ORIGINS.split(',')
        .map((o) => o.trim())
        .filter(Boolean)
    : []

  corsOptions.origin = allowedOrigins

  return {
    port,
    host,
    appEndpoint,
    prefix,
    enableCors,
    corsOptions,
  }
})
