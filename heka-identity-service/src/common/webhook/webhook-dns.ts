import dns from 'node:dns/promises'

/** Resolves A and AAAA for `hostname`; missing families are ignored */
export async function resolveAllAddresses(hostname: string): Promise<string[]> {
  if (!hostname.trim()) return []

  const uniq = new Set<string>()
  await Promise.all([
    dns
      .resolve4(hostname)
      .then((list) => list.forEach((a) => uniq.add(a)))
      .catch(() => undefined),
    dns
      .resolve6(hostname)
      .then((list) => list.forEach((a) => uniq.add(a)))
      .catch(() => undefined),
  ])
  return [...uniq]
}

export async function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), ms)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}
