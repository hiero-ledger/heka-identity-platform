const AGE_OVER_ELEMENT = /^age_over_\d+$/

/**
 * Normalizes mdoc namespace values before signing.
 *
 * ISO/IEC 18013-5 defines `age_over_NN` data elements as booleans. Clients
 * (e.g. the Web UI) submit form values as strings, and wallets match
 * `age_over_NN` requests against the *boolean* value of the issued element
 * (`@owf/mdoc` `handleAgeOverNN`), so a string `'true'` never matches and the
 * holder cannot present the credential ("No matching field found").
 */
export const normalizeMdocNamespaces = (
  namespaces: Record<string, Record<string, unknown>>,
): Record<string, Record<string, unknown>> =>
  Object.fromEntries(
    Object.entries(namespaces).map(([namespace, elements]) => [
      namespace,
      Object.fromEntries(
        Object.entries(elements).map(([identifier, value]) => [
          identifier,
          AGE_OVER_ELEMENT.test(identifier) ? toBoolean(value) : value,
        ]),
      ),
    ]),
  )

const toBoolean = (value: unknown): unknown => {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (normalized === 'true') return true
    if (normalized === 'false') return false
  }
  return value
}
