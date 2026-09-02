/**
 * undici reports network-level failures as a bare `TypeError: fetch failed`,
 * hiding the useful part (ECONNREFUSED, ENOTFOUND, …) in `cause`. Flatten the
 * cause chain into something diagnosable.
 */
export function describeFetchError(error: unknown): string {
  const parts: string[] = []
  let current: unknown = error
  while (current instanceof Error) {
    parts.push(current.message)
    // Error.cause is runtime-present on Node 22; the compile target's lib predates it
    current = (current as Error & { cause?: unknown }).cause
  }
  if (parts.length === 0) parts.push(String(error))
  return parts.join(' — ')
}
