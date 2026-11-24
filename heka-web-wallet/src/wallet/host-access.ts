const OPTIONAL_HTTPS_ORIGINS = ['https://*/*']

export function referencesHttps(value: string): boolean {
  let decoded: string
  try {
    decoded = decodeURIComponent(value)
  } catch {
    decoded = value
  }
  return /https:\/\//i.test(decoded)
}

export async function needsHostGrant(value: string): Promise<boolean> {
  if (!referencesHttps(value)) return false
  if (!chrome.permissions?.contains) return true
  const granted = await chrome.permissions.contains({ origins: OPTIONAL_HTTPS_ORIGINS })
  return !granted
}

/** Must run from a click. Chrome rejects permissions.request without a user gesture. */
export async function requestOptionalHostAccess(): Promise<boolean> {
  if (chrome.permissions?.contains) {
    const granted = await chrome.permissions.contains({ origins: OPTIONAL_HTTPS_ORIGINS })
    if (granted) return true
  }
  if (!chrome.permissions?.request) return false
  return chrome.permissions.request({ origins: OPTIONAL_HTTPS_ORIGINS })
}
