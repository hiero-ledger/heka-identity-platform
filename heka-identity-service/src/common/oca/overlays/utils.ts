export const mulberry32 = (seed: number): number => {
  let t = (seed += 0x6d2b79f5)
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

export const hashToRGBA = (hash: number): string => {
  let color = '#'
  const colorRangeUpperBound = 256

  // once for r, g, b
  for (let i = 0; i < 3; i++) {
    // append a pseudorandom two-char hexidecimal value from the lower half of the color spectrum (to limit to darker colors)
    color += ('0' + Math.floor((mulberry32(hash + i) * colorRangeUpperBound) / 2).toString(16)).slice(-2)
  }

  return color
}

export const hashCode = (s: string): number => {
  return s.split('').reduce((hash, char) => char.charCodeAt(0) + ((hash << 5) - hash), 0)
}

export const generateColor = (seed: string): string => {
  return hashToRGBA(hashCode(seed))
}
