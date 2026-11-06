export interface IndyBesuModuleConfigOptions {
  chainId: number
  nodeAddress: string
  endorserPrivateKey: string
  endorseDidChanges?: boolean
}

export class IndyBesuModuleConfig {
  public readonly chainId!: number
  public readonly nodeAddress!: string
  public readonly endorserPrivateKey!: string
  public readonly endorseDidChanges!: boolean

  public constructor(options: IndyBesuModuleConfigOptions) {
    this.chainId = options.chainId
    this.nodeAddress = options.nodeAddress
    this.endorserPrivateKey = options.endorserPrivateKey
    this.endorseDidChanges = options.endorseDidChanges ?? false
  }
}
