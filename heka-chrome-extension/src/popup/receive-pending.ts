import { PENDING_OFFER_KEY, RECEIVE_STATUS_KEY } from '../wallet/storage-keys'

let inFlight: Promise<void> | null = null

export function ensurePendingReceive(): void {
  if (inFlight) return
  inFlight = consumePendingOffer().finally(() => {
    inFlight = null
  })
}

async function consumePendingOffer(): Promise<void> {
  const stored = await chrome.storage.local.get(PENDING_OFFER_KEY)
  const offerUri = stored[PENDING_OFFER_KEY]
  if (typeof offerUri !== 'string' || !offerUri.startsWith('openid-credential-offer:')) return

  await chrome.storage.local.set({
    [RECEIVE_STATUS_KEY]: { state: 'working', message: 'Starting the wallet… Keep this popup open.' },
  })

  try {
    const { receiveCredentialOffer } = await import('../oid4vci/receive')
    const credentials = await receiveCredentialOffer(offerUri)
    await chrome.storage.local.remove(PENDING_OFFER_KEY)
    const message = `Received ${credentials.length} credential${credentials.length === 1 ? '' : 's'}.`
    await chrome.storage.local.set({ [RECEIVE_STATUS_KEY]: { state: 'done', message } })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Credential receive failed'
    await chrome.storage.local.set({
      [RECEIVE_STATUS_KEY]: {
        state: 'error',
        message: `${message} The offer is still saved — retry from this popup.`,
      },
    })
  }
}
