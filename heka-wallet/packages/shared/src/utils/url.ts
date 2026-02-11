const urlRegex = /^(.*:)\/\/([A-Za-z0-9-.]+)(:[0-9]+)?(.*)$/

export function getHostNameFromUrl(url: string) {
  const parts = urlRegex.exec(url)
  return parts ? parts[2] : undefined
}

export function extractUrlParam(url: string, paramName: string): string | null {
  const regex = new RegExp(`[?&]${paramName}=([^&#]*)`)

  const match = url.match(regex)

  return match ? match[1] : null
}

export async function fetchRedirectLocation(url: string) {
  const response = await fetch(url, { redirect: 'manual' })

  if (response.status !== 301 && response.status !== 302) {
    throw new Error(`Incorrect response: ${response}`)
  }

  return response.headers.get('location')!
}
