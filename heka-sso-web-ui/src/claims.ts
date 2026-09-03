export type Claims = Record<string, unknown>

export function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined
}

export function isTrue(value: unknown): boolean {
  return value === true || value === 1 || value === 'true' || value === '1'
}

export function claim(claims: Claims, name: string): unknown {
  if (name in claims) return claims[name]
  const namespaced = Object.keys(claims).find((key) => key.endsWith(`/${name}`))
  return namespaced ? claims[namespaced] : undefined
}

export function presentedAttributes(claims: Claims): Record<string, unknown> {
  const raw = claim(claims, 'vc_presented_attributes')
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, unknown>
  if (typeof raw === 'string') {
    try {
      const parsed: unknown = JSON.parse(raw)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>
    } catch {
      /* not JSON */
    }
  }
  return {}
}

export function attribute(claims: Claims, name: string): unknown {
  const presented = presentedAttributes(claims)
  if (name in presented) return presented[name]
  const dotted = Object.keys(presented).find((key) => key.endsWith(`.${name}`))
  if (dotted) return presented[dotted]
  return claim(claims, name)
}

export function firstName(claims: Claims): string | undefined {
  return asString(attribute(claims, 'given_name'))
}

export function lastName(claims: Claims): string | undefined {
  return asString(attribute(claims, 'family_name'))
}

export function displayName(claims: Claims): string | undefined {
  const parts = [firstName(claims), lastName(claims)].filter((part): part is string => part !== undefined)
  if (parts.length) return parts.join(' ')
  return asString(claim(claims, 'name')) ?? asString(claim(claims, 'email')) ?? asString(claim(claims, 'sub'))
}

export function email(claims: Claims): string | undefined {
  return asString(attribute(claims, 'email'))
}

export function ageOver18(claims: Claims): boolean | undefined {
  const value = attribute(claims, 'age_over_18')
  if (value === undefined || value === null || value === '') return undefined
  return isTrue(value)
}

export function amrValues(claims: Claims): string[] {
  const raw = claim(claims, 'amr')
  if (Array.isArray(raw)) return raw.filter((v): v is string => typeof v === 'string')
  if (typeof raw === 'string')
    return raw
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean)
  return []
}

export function signedInWithWallet(claims: Claims): boolean {
  return amrValues(claims).includes('vc')
}

export function formatTimestamp(value: unknown, locale?: string): string | undefined {
  const seconds = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  if (!Number.isFinite(seconds) || seconds <= 0) return undefined
  return new Date(seconds * 1000).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' })
}

export function subject(claims: Claims): string | undefined {
  return asString(claim(claims, 'sub'))
}
