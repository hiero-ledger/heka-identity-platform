export interface IndyBesuModuleConfigOptions {
  chainId: number
  nodeAddress: string
  endorserPrivateKey: string
}

export class IndyBesuModuleConfig {
  public readonly chainId!: number
  public readonly nodeAddress!: string
  public readonly endorserPrivateKey!: string

  public constructor(options: IndyBesuModuleConfigOptions) {
    this.chainId = options.chainId
    this.nodeAddress = options.nodeAddress
    this.endorserPrivateKey = options.endorserPrivateKey
  }
}
