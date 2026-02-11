import { oauthStoreConfig, walletProviderURL } from '../config'

import { OAuthStore } from './OAuthStore'
import { PasskeysStore } from './PasskeysStore'

export class RootStore {
  public readonly oauthStore: OAuthStore
  public readonly passkeysStore: PasskeysStore

  constructor() {
    this.oauthStore = new OAuthStore(oauthStoreConfig)
    this.passkeysStore = new PasskeysStore(walletProviderURL)
  }

  get isLoading(): boolean {
    return this.oauthStore.isLoading
  }
}
