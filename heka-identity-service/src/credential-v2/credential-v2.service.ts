import { OpenId4VciCredentialFormatProfile } from '@credo-ts/openid4vc'
import { InternalServerErrorException, UnprocessableEntityException } from '@nestjs/common'
import { v4 } from 'uuid'

import { TenantAgent } from 'common/agent'
import { AuthInfo } from 'common/auth'
import { InjectLogger, Logger } from 'common/logger'
import { AriesCredentialFormat, OpenId4VcCredentialFormat, ProtocolType } from 'common/types'
import { AriesRegistrationCredentials } from 'common/types/registration-credentials'
import { CredentialService } from 'credential/credential.service'
import { CredentialRecordDto } from 'credential/dto'
import {
  CredentialValue,
  OfferByIssuanceTemplateRequest,
  OfferByIssuanceTemplateResponse,
} from 'credential-v2/dto/offer-by-template'
import {
  ProofByVerificationTemplateRequest,
  ProofByVerificationTemplateResponse,
} from 'credential-v2/dto/proof-by-template'
import { IssuanceTemplateService } from 'issuance-template'
import { IssuanceTemplate as IssuanceTemplateResponse } from 'issuance-template/dto/common/issuance-template'
import {
  OpenId4VcIssuanceSessionCreateOfferJwtVcJsonCredentialOptions,
  OpenId4VcIssuanceSessionCreateOfferJwtVcJsonLdCredentialOptions,
  OpenId4VcIssuanceSessionCreateOfferLdpVcCredentialOptions,
  OpenId4VcIssuanceSessionCreateOfferSdJwtCredentialOptions,
  OpenId4VcIssuanceSessionsCreateOfferResponse,
} from 'openid4vc/issuance-sessions/dto/credential-offer.dto'
import { OpenId4VcIssuanceSessionService } from 'openid4vc/issuance-sessions/issuance-session.service'
import {
  DifPresentationExchangeInputDescriptor,
  OpenId4VcVerificationSessionCreateRequestDto,
  OpenId4VcVerificationSessionCreateRequestResponse,
} from 'openid4vc/verification-sessions/dto'
import { OpenId4VcVerificationSessionService } from 'openid4vc/verification-sessions/verification-session.service'
import { AttrsPredsProofParamsDto, ProofRecordDto } from 'proof/dto'
import { OptionalityEnum } from 'proof/dto/presentation-exchange-definition.dto'
import { AnoncredsProofRequestDto, DifPresentationExchangeDto, ProofRequestFormat } from 'proof/dto/proof-request.dto'
import { ProofService } from 'proof/proof.service'
import { SchemaRegistration } from 'schema-v2/dto/common/schema'
import { Oid4vcCredentials } from 'schema-v2/dto/common/types'
import { VerificationTemplateService } from 'verification-template'
import { GetVerificationTemplateResponse } from 'verification-template/dto'

export class CredentialV2Service {
  public constructor(
    @InjectLogger(CredentialV2Service) private readonly logger: Logger,
    private readonly issuanceTemplateService: IssuanceTemplateService,
    private readonly verificationTemplateService: VerificationTemplateService,
    private readonly credentialService: CredentialService,
    private readonly proofService: ProofService,
    private readonly openId4VcIssuanceSessionService: OpenId4VcIssuanceSessionService,
    private readonly openId4VcVerificationSessionService: OpenId4VcVerificationSessionService,
  ) {}

  public offerByTemplate = async (
    tenantAgent: TenantAgent,
    authInfo: AuthInfo,
    request: OfferByIssuanceTemplateRequest,
  ): Promise<OfferByIssuanceTemplateResponse> => {
    const logger = this.logger.child('offerByTemplate')
    logger.trace('>')

    const template = await this.issuanceTemplateService.getTemplateById(authInfo, request.templateId)

    let offer
    let response: OfferByIssuanceTemplateResponse | undefined
    switch (template.protocol) {
      case ProtocolType.Aries:
        offer = await this.offerForAries(tenantAgent, template, request)
        response = {
          id: offer.id,
          offer: undefined,
          state: offer.state,
        }
        break
      case ProtocolType.Oid4vc:
        offer = await this.offerForOpenId4vc(tenantAgent, authInfo, template, request)
        response = {
          id: offer.issuanceSession.id,
          offer: offer.credentialOffer,
          state: offer.issuanceSession.state,
        }
        break
      default:
        response = undefined
    }
    if (!response) {
      throw new InternalServerErrorException(`Failed to make the credential offer`)
    }

    logger.trace('<')
    return response
  }

  public offerForAries = async (
    tenantAgent: TenantAgent,
    template: IssuanceTemplateResponse,
    request: OfferByIssuanceTemplateRequest,
  ): Promise<CredentialRecordDto> => {
    if (!request.connectionId) {
      throw new UnprocessableEntityException(`Connection ID must me specified for Aries protocol`)
    }
    const connectionRecord = await tenantAgent.modules.connections.findById(request.connectionId)
    if (!connectionRecord) {
      throw new UnprocessableEntityException(`Referenced connection with ID=${request.connectionId} not found`)
    }

    const registration = template.schema.registrations.find(
      (r) => r.protocol === template.protocol && r.network === template.network && r.did === template.did,
    )
    if (!registration) {
      throw new UnprocessableEntityException(`Schema is not registered for the using`)
    }

    const credentialDefinitionId = (registration.credentials as AriesRegistrationCredentials).credentialDefinitionId
    return await this.credentialService.offer(tenantAgent, {
      credentialDefinitionId,
      comment: request.comment,
      format: template.credentialFormat as AriesCredentialFormat,
      connectionId: connectionRecord.id,
      attributes: request.credentials,
    })
  }

  public proofByTemplate = async (
    tenantAgent: TenantAgent,
    authInfo: AuthInfo,
    request: ProofByVerificationTemplateRequest,
  ): Promise<ProofByVerificationTemplateResponse> => {
    const logger = this.logger.child('proofByTemplate', { request })
    logger.trace('>')

    const template = await this.verificationTemplateService.getTemplateById(authInfo, request.templateId)

    let proof
    let response: ProofByVerificationTemplateResponse | undefined
    switch (template.protocol) {
      case ProtocolType.Aries:
        proof = await this.proofForAries(tenantAgent, template, request)
        response = {
          id: proof.id,
          request: undefined,
          state: proof.state,
        }
        break
      case ProtocolType.Oid4vc:
        proof = await this.proofForOpenId4vc(tenantAgent, template, request)
        response = {
          id: proof.verificationSession.id,
          request: proof.authorizationRequest,
          state: proof.verificationSession.state,
        }
        break
      default:
        response = undefined
    }
    if (!response) {
      throw new InternalServerErrorException(`Failed to make the credential offer`)
    }

    logger.trace('<')
    return response
  }

  private async offerForOpenId4vc(
    tenantAgent: TenantAgent,
    authInfo: AuthInfo,
    template: IssuanceTemplateResponse,
    request: OfferByIssuanceTemplateRequest,
  ): Promise<OpenId4VcIssuanceSessionsCreateOfferResponse> {
    const registration = this.ensureSchemaRegistration(template)

    return await this.openId4VcIssuanceSessionService.offer(authInfo, tenantAgent, {
      publicIssuerId: registration.did,
      credentials: [this.buildOpenIdCredentials(request.credentials, template, registration)],
    })
  }

  private buildOpenIdCredentials(
    values: CredentialValue[],
    template: IssuanceTemplateResponse,
    registration: SchemaRegistration,
  ) {
    const payload = values.reduce((obj, v) => Object.assign(obj, { [v.name]: v.value }), {})
    switch (template.credentialFormat as OpenId4VcCredentialFormat) {
      case OpenId4VcCredentialFormat.SdJwtVc:
        return {
          format: OpenId4VciCredentialFormatProfile.SdJwtVc,
          credentialSupportedId: (registration.credentials as Oid4vcCredentials).supportedCredentialId,
          issuer: {
            did: registration.did,
            method: 'did',
          },
          disclosureFrame: {
            _sd: values.map((v) => v.name),
          },
          payload,
        } as OpenId4VcIssuanceSessionCreateOfferSdJwtCredentialOptions
      case OpenId4VcCredentialFormat.JwtVcJson:
        return {
          format: OpenId4VciCredentialFormatProfile.JwtVcJson,
          credentialSupportedId: (registration.credentials as Oid4vcCredentials).supportedCredentialId,
          issuer: {
            did: registration.did,
            method: 'did',
          },
          credentialSubject: payload,
        } as OpenId4VcIssuanceSessionCreateOfferJwtVcJsonCredentialOptions
      case OpenId4VcCredentialFormat.JwtVcJsonLd:
        return {
          format: OpenId4VciCredentialFormatProfile.JwtVcJsonLd,
          credentialSupportedId: (registration.credentials as Oid4vcCredentials).supportedCredentialId,
          issuer: {
            did: registration.did,
            method: 'did',
          },
          credentialSubject: payload,
          '@context': ['https://www.w3.org/2018/credentials/v1'],
        } as OpenId4VcIssuanceSessionCreateOfferJwtVcJsonLdCredentialOptions
      case OpenId4VcCredentialFormat.LdpVc:
        return {
          format: OpenId4VciCredentialFormatProfile.LdpVc,
          credentialSupportedId: (registration.credentials as Oid4vcCredentials).supportedCredentialId,
          issuer: {
            did: registration.did,
            method: 'did',
          },
          credentialSubject: payload,
          '@context': ['https://www.w3.org/2018/credentials/v1'],
        } as OpenId4VcIssuanceSessionCreateOfferLdpVcCredentialOptions
    }
  }

  private async proofForAries(
    tenantAgent: TenantAgent,
    template: GetVerificationTemplateResponse,
    request: ProofByVerificationTemplateRequest,
  ): Promise<ProofRecordDto> {
    if (!request.connectionId) {
      throw new UnprocessableEntityException(`Connection ID must me specified for Aries protocol`)
    }
    const connectionRecord = await tenantAgent.modules.connections.findById(request.connectionId)
    if (!connectionRecord) {
      throw new UnprocessableEntityException(`Referenced connection with ID=${request.connectionId} not found`)
    }

    this.ensureSchemaRegistration(template)
    return this.proofService.request(tenantAgent, {
      connectionId: connectionRecord.id,
      request: this.buildAriesProofRequestParams(template, request),
      comment: request.comment,
    })
  }

  private async proofForOpenId4vc(
    tenantAgent: TenantAgent,
    template: GetVerificationTemplateResponse,
    request: ProofByVerificationTemplateRequest,
  ): Promise<OpenId4VcVerificationSessionCreateRequestResponse> {
    const registration = this.ensureSchemaRegistration(template)

    return this.openId4VcVerificationSessionService.createRequest(
      tenantAgent,
      this.buildOpenIdProofRequest(request.fields, template, registration),
    )
  }

  private buildOpenIdProofRequest(
    fields: string[],
    template: GetVerificationTemplateResponse,
    registration: SchemaRegistration,
  ): OpenId4VcVerificationSessionCreateRequestDto {
    let inputDescriptors: DifPresentationExchangeInputDescriptor[]
    if (template.credentialFormat === OpenId4VcCredentialFormat.SdJwtVc) {
      inputDescriptors = [
        {
          id: v4(),
          constraints: {
            limit_disclosure: 'required',
            fields: fields.map((field) => ({
              path: [`$.${field}`],
            })),
          },
          name: template.schema.name,
          purpose: 'To obtain credential data',
        },
      ]
    } else {
      inputDescriptors = [
        {
          id: v4(),
          constraints: {
            fields: [
              {
                path: ['$.vc.type.*', '$.vct', '$.type'],
                filter: {
                  type: 'string',
                  pattern: template.schema.name,
                },
              },
            ],
          },
          name: template.schema.name,
          purpose: 'To obtain credential data',
        },
      ]
    }
    return {
      publicVerifierId: registration.did,
      requestSigner: {
        method: 'did',
        did: registration.did,
      },
      presentationExchange: {
        definition: {
          id: v4(),
          name: template.schema.name,
          input_descriptors: inputDescriptors,
        },
      },
    }
  }

  private ensureSchemaRegistration(template: GetVerificationTemplateResponse) {
    const registration = template.schema.registrations.find(
      (r) => r.protocol === template.protocol && r.network === template.network && r.did === template.did,
    )
    if (!registration) {
      throw new UnprocessableEntityException(`Schema is not registered for the using`)
    }
    return registration
  }

  private buildAriesProofRequestParams(
    template: GetVerificationTemplateResponse,
    request: ProofByVerificationTemplateRequest,
  ): AnoncredsProofRequestDto | DifPresentationExchangeDto {
    switch (template.credentialFormat as AriesCredentialFormat) {
      case AriesCredentialFormat.AnoncredsIndy:
        return {
          format: ProofRequestFormat.AnoncredsIndy,
          name: template.schema.name,
          proofParams: new AttrsPredsProofParamsDto({
            attributes: request.fields.map((f) => ({ name: f })),
          }),
        }
      case AriesCredentialFormat.AnoncredsW3c:
        return {
          format: ProofRequestFormat.DifPresentationExchange,
          presentationExchange: {
            id: v4(),
            name: template.schema.name,
            purpose: template.schema.name,
            input_descriptors: [
              {
                id: v4(),
                name: template.schema.name,
                schema: [
                  {
                    uri: 'https://www.w3.org/2018/credentials/v1',
                  },
                ],
                constraints: {
                  limit_disclosure: OptionalityEnum.REQUIRED,
                  fields: request.fields?.map((field) => ({
                    path: [`$.credentialSubject.${field}`],
                  })),
                },
              },
            ],
          },
        }
    }
  }
}
