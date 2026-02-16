export class OID4VCRegistrationCredentials {
  public readonly supportedCredentialId!: string
  public readonly statusListId!: string

  public constructor(partial: Partial<OID4VCRegistrationCredentials>) {
    Object.assign(this, partial)
  }
}
