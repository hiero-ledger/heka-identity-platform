/**
 * Returns the value of the named environment variable if it is set (non-empty),
 * otherwise emits a one-time loud warning to stderr and returns the supplied fallback.
 *
 * Why this exists:
 *   Several `registerAs(...)` config factories in this service used to silently fall
 *   back to hardcoded, publicly-known development credentials whenever the operator
 *   forgot to set the corresponding env var. The fallback was indistinguishable from
 *   an explicit configuration choice, which let services boot successfully in a
 *   completely insecure state (see GitHub issue #17).
 *
 * Why `console.warn` (not the Nest/Pino logger):
 *   `registerAs` factories run during module construction, BEFORE the Pino logger
 *   has been instantiated. The warning has to be emitted via `console` so it is
 *   visible regardless of logger init order.
 *
 * The warning is emitted at most once per `envName` per process so that callers
 * who read the same env var multiple times do not spam the log.
 */
const warnedFor = new Set<string>()

export function valueOrDefaultWithWarning(envName: string, fallback: string, label: string): string {
  const raw = process.env[envName]
  if (raw && raw.length > 0) {
    return raw
  }

  if (!warnedFor.has(envName)) {
    warnedFor.add(envName)
    // eslint-disable-next-line no-console
    console.warn(
      [
        '',
        '============================================================',
        `WARNING: ${envName} is not set; using insecure default for ${label}.`,
        'This default value is publicly known and MUST NOT be used in production.',
        `Set the ${envName} environment variable to override.`,
        '============================================================',
        '',
      ].join('\n'),
    )
  }

  return fallback
}
