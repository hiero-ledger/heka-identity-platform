import {
  AgentContext,
  DidCreateOptions,
  DidCreateResult,
  DidDeactivateOptions,
  DidDeactivateResult,
  DidDocumentBuilder,
  DidDocumentService,
  DidRegistrar,
  DidUpdateOptions,
  DidUpdateResult,
  getEcdsaSecp256k1VerificationKey2019,
  DidsApi,
  Buffer,
  Kms,
} from '@credo-ts/core'

import { DidRegistry, IndyBesuSigner } from '../ledger'

import { toIndyBesuDidDocument } from './DidTypesMapping'
import { buildDid } from './DidUtils'

export class IndyBesuDidRegistrar implements DidRegistrar {
  public readonly supportedMethods = ['indybesu']

  public async create(agentContext: AgentContext, options: IndyBesuDidCreateOptions): Promise<DidCreateResult> {
    const didRegistry = agentContext.dependencyManager.resolve(DidRegistry)
    const didsApi = agentContext.dependencyManager.resolve(DidsApi)
    const kms = agentContext.dependencyManager.resolve(Kms.KeyManagementApi)

    const key = await kms.createKey({
      type: {
        kty: 'EC',
        crv: 'secp256k1',
      },
    })

    const publicJwk = Kms.PublicJwk.fromPublicJwk(key.publicJwk)
    const didDocument = this.buildDidDocument(publicJwk, {
      method: options.method,
      network: options.options.network,
      endpoints: options.options.endpoints,
    })

    const endorser = await IndyBesuSigner.create(options.options.endorserKeyId, kms)
    const identity = await IndyBesuSigner.create(key.keyId, kms)

    try {
      await didRegistry.endorseDid(toIndyBesuDidDocument(didDocument), identity, endorser)

      // TODO: Check and fix if required the next line. didDocument.verificationMethod![0].id can be undefined.
      const didDocumentRelativeKeyId = didDocument.verificationMethod![0].id
      await didsApi.import({
        did: didDocument.id,
        didDocument,
        keys: [
          {
            kmsKeyId: key.keyId,
            didDocumentRelativeKeyId,
          },
        ],
      })

      return {
        didDocumentMetadata: {},
        didRegistrationMetadata: {},
        didState: {
          state: 'finished',
          did: didDocument.id,
          didDocument: didDocument,
          secret: options.secret,
        },
      }
    } catch (error) {
      return {
        didDocumentMetadata: {},
        didRegistrationMetadata: {},
        didState: {
          state: 'failed',
          reason: `unknownError: ${(error as Error).message}`,
        },
      }
    }
  }

  public update(agentContext: AgentContext, options: IndyBesuDidUpdateOptions): Promise<DidUpdateResult> {
    throw new Error(
      'Method not implemented. PoC: https://github.com/DSRCorporation/aries-framework-javascript/tree/indy-besu-demo/packages/indy-vdr/src',
    )
  }

  public deactivate(agentContext: AgentContext, options: IndyBesuDidDeactivateOptions): Promise<DidDeactivateResult> {
    throw new Error(
      'Method not implemented. PoC: https://github.com/DSRCorporation/aries-framework-javascript/tree/indy-besu-demo/packages/indy-vdr/src',
    )
  }

  private buildDidDocument(publicJwk: Kms.PublicJwk<Kms.Secp256k1PublicJwk>, options: BuildDidDocumentOptions) {
    const did = buildDid(options.method, options.network, Buffer.from(publicJwk.publicKey.publicKey))

    const verificationMethod = getEcdsaSecp256k1VerificationKey2019({
      id: `${did}#KEY-1`,
      publicJwk,
      controller: did,
    })

    const didDocumentBuilder = new DidDocumentBuilder(did)
      .addContext('https://www.w3.org/ns/did/v1')
      .addVerificationMethod(verificationMethod)
      .addAuthentication(verificationMethod.id)
      .addAssertionMethod(verificationMethod.id)

    options.endpoints?.forEach((endpoint) => {
      const service = new DidDocumentService({
        id: `${did}#${endpoint.type}`,
        serviceEndpoint: endpoint.endpoint,
        type: endpoint.type,
      })
      didDocumentBuilder.addService(service)
    })

    return didDocumentBuilder.build()
  }
}

export interface IndyBesuEndpoint {
  type: string
  endpoint: string
}

export interface IndyBesuDidCreateOptions extends DidCreateOptions {
  method: 'indybesu'
  did?: never
  options: {
    network: string
    endpoints?: IndyBesuEndpoint[]
    endorserKeyId: string
  }
  secret: {
    didPrivateKey?: Buffer
  }
}

export interface IndyBesuDidUpdateOptions extends DidUpdateOptions {
  options: {
    network: string
    accountKeyId: string
  }
}

export interface IndyBesuDidDeactivateOptions extends DidDeactivateOptions {
  options: {
    network: string
    accountKeyId: string
  }
}

export interface BuildDidDocumentOptions {
  method: 'indybesu'
  network: string
  endpoints?: IndyBesuEndpoint[]
}
