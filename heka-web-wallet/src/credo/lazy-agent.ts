/// <reference types="vite/client" />
import type { Agent } from '@credo-ts/core'

import { browserAgentDependencies } from './browser-dependencies'

let agentInstance: Agent | null = null
let initPromise: Promise<Agent> | null = null

export async function getOrCreateAgent(): Promise<Agent> {
  if (agentInstance) return agentInstance
  if (initPromise) return initPromise

  initPromise = (async () => {
    try {
      const { Agent, DidsModule, JwkDidResolver, KeyDidResolver, PeerDidResolver, SdJwtVcModule, WebDidResolver } =
        await import('@credo-ts/core')
      const { KeyManagementModule } = await import('@credo-ts/core/kms')
      const { OpenId4VcModule } = await import('@credo-ts/openid4vc')
      const { BrowserStorageModule } = await import('./BrowserStorageModule')
      const { HederaDidResolver } = await import('./HederaDidResolver')
      const { typeMetadataResolver } = await import('./type-metadata-policy')
      const { WebCryptoKeyAgreementService } = await import('./WebCryptoKeyAgreementService')
      const { WebCryptoKeyManagementService } = await import('./WebCryptoKeyManagementService')

      const agent = new Agent({
        config: {
          // http:// issuers and verifiers only in the development build (`yarn dev`). MODE, not DEV:
          // `vite build --mode development` keeps NODE_ENV=production, so DEV is false.
          allowInsecureHttpUrls: import.meta.env.MODE === 'development',
          // IndexedDbStorageService stamps a new wallet with the current storage version. After a
          // Credo upgrade that changes it, the agent refuses to start rather than migrate the only
          // copy of the wallet (there is no backup) without the holder's knowledge.
          autoUpdateStorageOnStartup: false,
        },
        dependencies: browserAgentDependencies,
        modules: {
          dids: new DidsModule({
            resolvers: [
              new HederaDidResolver(),
              new WebDidResolver(),
              new KeyDidResolver(),
              new PeerDidResolver(),
              new JwkDidResolver(),
            ],
          }),
          openid4vc: new OpenId4VcModule({}),
          sdJwtVc: new SdJwtVcModule({ customTypeMetadataResolver: typeMetadataResolver }),
          kms: new KeyManagementModule({
            // Holder keys, and single-use ECDH keys for encrypted OpenID4VP responses.
            backends: [new WebCryptoKeyManagementService(), new WebCryptoKeyAgreementService()],
            defaultBackend: 'webcrypto-browser',
          }),
          browserStorage: new BrowserStorageModule(),
        },
      })

      await agent.initialize()
      agentInstance = agent
      return agent
    } catch (error) {
      initPromise = null
      throw error
    }
  })()

  return initPromise
}
