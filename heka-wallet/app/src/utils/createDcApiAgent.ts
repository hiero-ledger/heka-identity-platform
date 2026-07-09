import { WalletSecret } from '@bifold/core'
import { AskarModule } from '@credo-ts/askar'
import {
  Agent,
  DidsModule,
  JwkDidResolver,
  KeyDidResolver,
  PeerDidResolver,
  WebDidResolver,
  X509Module,
} from '@credo-ts/core'
import { OpenId4VcModule } from '@credo-ts/openid4vc'
import { agentDependencies } from '@credo-ts/react-native'
import { NativeAskar } from '@openwallet-foundation/askar-react-native'

import { CredoLogger } from '../logger'

import { HekaWalletAgent, TRUSTED_X509_CERTIFICATES } from './agent'

/**
 * Creates and initializes a minimal Credo agent for the Digital Credentials API overlay.
 *
 * The overlay runs in a separate Android activity / React root, so it owns its own agent rather
 * than sharing the main app's Bifold agent.
 * This agent works with the same Askar store and includes only what an OpenID4VP holder needs to present mdoc / SD-JWT VC
 * credentials.
 */
export async function createDcApiAgent(walletSecret: WalletSecret): Promise<HekaWalletAgent> {
  if (!walletSecret.key) {
    throw new Error('Wallet key is not defined')
  }

  const agent = new Agent({
    config: {
      logger: new CredoLogger('DC API Agent'),
      autoUpdateStorageOnStartup: false,
      allowInsecureHttpUrls: true,
    },
    dependencies: agentDependencies,
    modules: {
      askar: new AskarModule({
        askar: NativeAskar.instance,
        store: { id: walletSecret.id, key: walletSecret.key },
      }),
      openid4vc: new OpenId4VcModule(),
      dids: new DidsModule({
        resolvers: [new WebDidResolver(), new KeyDidResolver(), new JwkDidResolver(), new PeerDidResolver()],
      }),
      x509: new X509Module({
        trustedCertificates: [...TRUSTED_X509_CERTIFICATES],
      }),
    },
  })

  try {
    await agent.initialize()
  } catch (error) {
    // A failed initialize (e.g. a wrong store key when the key is derived from an incorrect PIN)
    // must not leave a partially-opened Askar store behind.
    await agent.shutdown().catch(() => undefined)
    throw error
  }

  return agent as unknown as HekaWalletAgent
}
