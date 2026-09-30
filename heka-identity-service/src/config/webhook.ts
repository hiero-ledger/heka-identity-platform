import { registerAs } from '@nestjs/config'

const DEFAULT_HTTP_TIMEOUT_MS = 10_000

const parsePositiveInt = (raw: string | undefined, fallback: number): number => {
  const parsed = raw !== undefined ? Number.parseInt(raw, 10) : Number.NaN
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

export default registerAs('webhook', () => ({
  // Plaintext callbacks are rejected unless explicitly enabled (local development).
  allowHttp: process.env.WEBHOOK_ALLOW_HTTP === 'true',

  // Allows loopback / private / reserved callback targets (local development, Docker, CI).
  // Does not relax the scheme, credential, redirect, timeout or response size rules.
  allowPrivateAddresses: process.env.WEBHOOK_ALLOW_PRIVATE_ADDRESSES === 'true',

  // Wall-clock deadline for a single webhook POST.
  timeoutMs: parsePositiveInt(process.env.WEBHOOK_HTTP_TIMEOUT_MS, DEFAULT_HTTP_TIMEOUT_MS),
}))
