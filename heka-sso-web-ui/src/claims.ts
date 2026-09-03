// Pure helpers over the decoded ID-token claims. The RP sees
// three shapes of the same data, so every accessor is tolerant:
//
// - Keycloak: brokered claims arrive through attribute importers + protocol
//   mappers — `age_over_18` is the string "true", `amr` a string array,
//   `vc_presented_attributes` usually absent (not mapped by the demo realm).
// - Auth0: non-standard claims are namespaced custom claims
//   (`https://<namespace>/amr`), so lookups also match `<anything>/<name>`.
// - Bridge-direct (tests, preview): `vc_presented_attributes` is an object of
//   `<template>.<attribute>` keys with the full disclosed set.

export type Claims = Record<string, unknown>

export function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined
}

/** `true`, `"true"`, `1`, `"1"` > true (Keycloak string attributes). */
export function isTrue(value: unknown): boolean {
  return value === true || value === 1 || value === 'true' || value === '1'
}

/** Top-level claim by name; falls back to an Auth0-style namespaced key (`�/name`). */
export function claim(claims: Claims, name: string): unknown {
  if (name in claims) return claims[name]
  const namespaced = Object.keys(claims).find((key) => key.endsWith(`/${name}`))
  return namespaced ? claims[namespaced] : undefined
}

/** The wallet-disclosed attribute set, if the token carries it (object or JSON string). */
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

/**
 * A disclosed attribute by name: exact key or `<template>.<name>` in
 * `vc_presented_attributes`, then the top-level (mapped) claim.
 */
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

/** `given_name family_name`, falling back to `name`, then `email`, then `sub`. */
export function displayName(claims: Claims): string | undefined {
  const parts = [firstName(claims), lastName(claims)].filter((part): part is string => part !== undefined)
  if (parts.length) return parts.join(' ')
  return asString(claim(claims, 'name')) ?? asString(claim(claims, 'email')) ?? asString(claim(claims, 'sub'))
}

export function email(claims: Claims): string | undefined {
  return asString(attribute(claims, 'email'))
}

/** `undefined` when the attribute was not disclosed at all. */
export function ageOver18(claims: Claims): boolean | undefined {
  const value = attribute(claims, 'age_over_18')
  if (value === undefined || value === null || value === '') return undefined
  return isTrue(value)
}

/** Authentication Methods References as a string array (array, single string, or comma-joined). */
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

/** The bridge stamps `amr: ['vc']` on wallet logins (INTEGRATION.md P1.6). */
export function signedInWithWallet(claims: Claims): boolean {
  return amrValues(claims).includes('vc')
}

/** Unix seconds (number or numeric string) > local date-time; `undefined` otherwise. */
export function formatTimestamp(value: unknown, locale?: string): string | undefined {
  const seconds = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  if (!Number.isFinite(seconds) || seconds <= 0) return undefined
  return new Date(seconds * 1000).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' })
}

export function subject(claims: Claims): string | undefined {
  return asString(claim(claims, 'sub'))
}
