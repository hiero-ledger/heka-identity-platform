// Uses console.warn (not the Nest/Pino logger) because registerAs() factories
// run before the logger is initialised.
const warnedFor = new Set<string>()

export function valueOrDefaultWithWarning(envName: string, fallback: string, label: string): string {
  const raw = process.env[envName]
  if (raw && raw.length > 0) {
    return raw
  }

  if (!warnedFor.has(envName)) {
    warnedFor.add(envName)
    // eslint-disable-next-line no-console
    console.warn(`WARNING: ${envName} not set; using insecure default for ${label}. Do not use in production.`)
  }

  return fallback
}
