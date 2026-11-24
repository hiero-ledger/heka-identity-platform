import 'reflect-metadata'
import { injectable } from 'tsyringe'

const DCQL_ONLY = 'Presentation Exchange is not supported. This wallet accepts DCQL requests only.'

@injectable()
export class DifPresentationExchangeService {
  validatePresentationDefinition(): never {
    throw new Error(DCQL_ONLY)
  }

  async getCredentialsForRequest(): Promise<never> {
    throw new Error(DCQL_ONLY)
  }

  async createPresentation(): Promise<never> {
    throw new Error(DCQL_ONLY)
  }
}
