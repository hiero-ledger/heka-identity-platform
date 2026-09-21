import { registerAs } from '@nestjs/config'

const parsePositiveInt = (raw: string | undefined, fallback: number): number => {
  const n = raw !== undefined ? Number.parseInt(raw, 10) : Number.NaN
  return Number.isFinite(n) && n > 0 ? n : fallback
}

export default registerAs(
  'webhookNotifications',
  (): {
    allowHttp: boolean
    timeoutMs: number
    maxRedirects: number
    dnsResolutionTimeoutMs: number
    allowInternalDnsNames: boolean
    maxResponseBodyBytes: number
  } => ({
    allowHttp: process.env.WEBHOOK_ALLOW_HTTP === 'true',
    timeoutMs: parsePositiveInt(process.env.WEBHOOK_HTTP_TIMEOUT_MS, 10_000),
    maxRedirects: parsePositiveInt(process.env.WEBHOOK_HTTP_MAX_REDIRECTS, 0),
    dnsResolutionTimeoutMs: parsePositiveInt(process.env.WEBHOOK_DNS_RESOLUTION_TIMEOUT_MS, 5000),
    allowInternalDnsNames: process.env.WEBHOOK_ALLOW_INTERNAL_DNS_NAMES === 'true',
    maxResponseBodyBytes: parsePositiveInt(process.env.WEBHOOK_MAX_RESPONSE_BODY_BYTES, 512_000),
  }),
)
