export class AriesRegistrationCredentials {
  public readonly credentialDefinitionId!: string
  public readonly revocationRegistryDefinitionId!: string

  public constructor(partial?: Partial<AriesRegistrationCredentials>) {
    Object.assign(this, partial)
  }
}
