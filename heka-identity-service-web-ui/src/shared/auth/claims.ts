/** First non-empty string among the given claims, in order; `null` when none is usable. */
export const pickDisplayName = (
  claims: Record<string, unknown> | undefined,
  nameClaims: string[],
): string | null => {
  for (const claim of nameClaims) {
    const value = claims?.[claim];
    if (typeof value === 'string' && value.trim().length > 0) return value;
  }
  return null;
};
