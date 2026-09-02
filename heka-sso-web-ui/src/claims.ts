export type Claims = Record<string, unknown>

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined
}

/** `given_name family_name`, falling back to `name`, then `email`, then `sub`. */
export function displayName(claims: Claims): string | undefined {
  const parts = [asString(claims.given_name), asString(claims.family_name)].filter(
    (part): part is string => part !== undefined,
  )
  if (parts.length) return parts.join(' ')
  return asString(claims.name) ?? asString(claims.email) ?? asString(claims.sub)
}
