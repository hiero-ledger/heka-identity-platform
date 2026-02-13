import { AgentContext, DependencyManager, Module } from '@credo-ts/core'
import { LedgerClient } from 'indybesu-vdr'

import { IndyBesuModuleConfig, IndyBesuModuleConfigOptions } from './IndyBesuModuleConfig'
import { CredentialDefinitionRegistry, DidRegistry, SchemaRegistry } from './ledger'

export class IndyBesuModule implements Module {
  public readonly config: IndyBesuModuleConfig

  public constructor(options: IndyBesuModuleConfigOptions) {
    this.config = new IndyBesuModuleConfig(options)
  }

  public register(dependencyManager: DependencyManager) {
    const contracts = [DidRegistry.config, SchemaRegistry.config, CredentialDefinitionRegistry.config]
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    const client = new LedgerClient(this.config.chainId, this.config.nodeAddress, contracts, undefined, undefined)

    dependencyManager.registerInstance(LedgerClient, client)
    dependencyManager.registerSingleton(DidRegistry)
    dependencyManager.registerSingleton(SchemaRegistry)
    dependencyManager.registerSingleton(CredentialDefinitionRegistry)
  }

  public async initialize(agentContext: AgentContext): Promise<void> {
    const client = agentContext.dependencyManager.resolve(LedgerClient)
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    await client.ping()
  }
}
