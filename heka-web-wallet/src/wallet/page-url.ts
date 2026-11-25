export function walletPageUrl(params?: { offer?: string; request?: string }): string {
  const url = new URL(chrome.runtime.getURL('wallet.html'))
  if (params?.offer) url.searchParams.set('offer', params.offer)
  if (params?.request) url.searchParams.set('request', params.request)
  return url.toString()
}
