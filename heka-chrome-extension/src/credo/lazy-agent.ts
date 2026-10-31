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
      const { Agent, DidsModule, JwkDidResolver, KeyDidResolver, PeerDidResolver, WebDidResolver } = await import(
        '@credo-ts/core'
      )
      const { KeyManagementModule } = await import('@credo-ts/core/kms')
      const { OpenId4VcModule } = await import('@credo-ts/openid4vc')
      const { BrowserStorageModule } = await import('./BrowserStorageModule')
      const { HederaDidResolver } = await import('./HederaDidResolver')
      const { WebCryptoKeyManagementService } = await import('./WebCryptoKeyManagementService')

      const agent = new Agent({
        config: {
          // Production builds require HTTPS issuer and verifier URLs.
          // `yarn dev` is a development-mode build, so localhost HTTP still works there.
          allowInsecureHttpUrls: import.meta.env.DEV,
          // A fresh IndexedDB has no storage version. Credo refuses to start
          // until that record is brought forward to the current framework version.
          autoUpdateStorageOnStartup: true,
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
          kms: new KeyManagementModule({
            backends: [new WebCryptoKeyManagementService()],
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
