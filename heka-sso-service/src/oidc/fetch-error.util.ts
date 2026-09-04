export function describeFetchError(error: unknown): string {
  const parts: string[] = []
  let current: unknown = error
  while (current instanceof Error) {
    parts.push(current.message)
    current = (current as Error & { cause?: unknown }).cause
  }
  if (parts.length === 0) parts.push(String(error))
  return parts.join(' — ')
}
