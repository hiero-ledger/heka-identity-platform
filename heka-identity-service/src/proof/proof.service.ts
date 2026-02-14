import type { W3cJsonPresentation } from '@credo-ts/core/build/modules/vc/models/presentation/W3cJsonPresentation'

import {
  AnonCredsCredentialDefinition,
  AnonCredsRequestedAttribute,
  AnonCredsRequestedPredicate,
} from '@credo-ts/anoncreds'
import { CredoError } from '@credo-ts/core'
import { ProofState } from '@credo-ts/didcomm'
import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common'

import { TenantAgent } from 'common/agent'

import { ProofRecordDto, RequestedAttributeDto, RequestedPredicateDto, ProofRequestDto } from './dto'
import {
  AttrsPredsProofParamsDto,
  CredDefIdProofParamsDto,
  ProofParamsDto,
  SchemaIdProofParamsDto,
} from './dto/proof-params.dto'
import { ProofRequestFormat } from './dto/proof-request.dto'

@Injectable()
export class ProofService {
  public async find(tenantAgent: TenantAgent, threadId?: string): Promise<ProofRecordDto[]> {
    const proofRecords = await tenantAgent.modules.proofs.findAllByQuery({ threadId })
    return proofRecords.map((record) => new ProofRecordDto(record))
  }

  public async request(tenantAgent: TenantAgent, req: ProofRequestDto): Promise<ProofRecordDto> {
    const connectionRecord = await tenantAgent.modules.connections.findById(req.connectionId)
    if (!connectionRecord) {
      throw new UnprocessableEntityException(`Referenced connection with ID=${req.connectionId} not found`)
    }

    const proofRequest = await this.buildRequest(tenantAgent, req)

    const proofRecord = await tenantAgent.modules.proofs.requestProof({
      connectionId: req.connectionId,
      comment: req.comment,
      protocolVersion: 'v2',
      proofFormats: proofRequest,
    })

    return new ProofRecordDto(proofRecord)
  }

  public async get(tenantAgent: TenantAgent, id: string): Promise<ProofRecordDto> {
    const proofRecord = await tenantAgent.modules.proofs.findById(id)
    if (!proofRecord) {
      throw new NotFoundException('Proof record not found')
    }

    const proofRecordDto = new ProofRecordDto(proofRecord)

    const formatData = await tenantAgent.modules.proofs.getFormatData(id)

    if (formatData.presentation?.anoncreds) {
      // @ts-ignore
      const revealedAttrs = formatData.presentation.anoncreds.requested_proof.revealed_attrs

      if (revealedAttrs) {
        proofRecordDto.revealedAttributes = []

        for (const key of Object.keys(revealedAttrs)) {
          proofRecordDto.revealedAttributes.push({ name: key, value: revealedAttrs[key].raw })
        }
      }
    }

    if (formatData.presentation?.presentationExchange) {
      const verifiableCredentials = (formatData.presentation.presentationExchange as W3cJsonPresentation)
        .verifiableCredential

      if (verifiableCredentials.length) {
        proofRecordDto.revealedAttributes = []
        for (const verifiableCredential of verifiableCredentials) {
          if (typeof verifiableCredential === 'string') {
            // skip?
          } else {
            for (const [attribute, value] of Object.entries(verifiableCredential.credentialSubject)) {
              proofRecordDto.revealedAttributes.push({
                name: attribute,
                // FIXME: Support all types
                value: value?.toString() ?? '',
              })
            }
          }
        }
      }
    }

    return proofRecordDto
  }

  public async present(tenantAgent: TenantAgent, id: string): Promise<ProofRecordDto> {
    let proofRecord = await tenantAgent.modules.proofs.findById(id)
    if (!proofRecord) {
      throw new NotFoundException('Proof record not found')
    }
    if (proofRecord.state === ProofState.Done) {
      throw new ConflictException('Proof is already presented')
    }

    try {
      proofRecord = await tenantAgent.modules.proofs.acceptRequest({ proofRecordId: id })
    } catch (err) {
      if (err instanceof CredoError && err.message === 'Unable to automatically select requested attributes') {
        throw new UnprocessableEntityException(err.message)
      }
      throw err
    }

    return new ProofRecordDto(proofRecord)
  }

  private async prepareProofReqParams(
    tenantAgent: TenantAgent,
    proofParams: ProofParamsDto,
  ): Promise<{
    requestedAttributes?: Record<string, AnonCredsRequestedAttribute>
    requestedPredicates?: Record<string, AnonCredsRequestedPredicate>
  }> {
    if (proofParams instanceof SchemaIdProofParamsDto) {
      const attrNames = await this.getSchemaAttributes(tenantAgent, proofParams.schemaId)
      return {
        requestedAttributes: createRequestedAttributesWithSchemaId(attrNames, proofParams.schemaId),
      }
    } else if (proofParams instanceof CredDefIdProofParamsDto) {
      const credDef = await this.getCredentialDefinition(tenantAgent, proofParams.credentialDefinitionId)
      const attrNames = await this.getSchemaAttributes(tenantAgent, credDef.schemaId)
      return {
        requestedAttributes: createRequestedAttributesWithCredDefId(attrNames, proofParams.credentialDefinitionId),
      }
    } else if (proofParams instanceof AttrsPredsProofParamsDto) {
      return {
        requestedAttributes: proofParams.attributes ? createRequestedAttributes(proofParams.attributes) : undefined,
        requestedPredicates: proofParams.predicates ? createRequestedPredicates(proofParams.predicates) : undefined,
      }
    } else {
      throw new InternalServerErrorException('Unexpected type of proofParams')
    }
  }

  private async getCredentialDefinition(
    tenantAgent: TenantAgent,
    credDefId: string,
  ): Promise<AnonCredsCredentialDefinition> {
    const resolutionResult = await tenantAgent.modules.anoncreds.getCredentialDefinition(credDefId)

    if (resolutionResult.resolutionMetadata.error === 'invalid') {
      throw new BadRequestException(
        `Invalid credential definition ID. Details: ${resolutionResult.resolutionMetadata.message ?? 'N/A'}`,
      )
    }

    if (resolutionResult.resolutionMetadata.error === 'unsupportedAnonCredsMethod') {
      throw new BadRequestException(
        `Unsupported credential definition ID format. Details: ${resolutionResult.resolutionMetadata.message ?? 'N/A'}`,
      )
    }

    if (resolutionResult.resolutionMetadata.error === 'notFound') {
      throw new UnprocessableEntityException('Credential definition with given ID does not exist')
    }

    if (resolutionResult.resolutionMetadata.error || !resolutionResult.credentialDefinition) {
      throw new InternalServerErrorException(
        `Credential definition was not resolved. Error: ${
          resolutionResult.resolutionMetadata.error ?? 'unknown'
        }. Details: ${resolutionResult.resolutionMetadata.message ?? 'N/A'}`,
      )
    }

    return resolutionResult.credentialDefinition
  }

  private async getSchemaAttributes(tenantAgent: TenantAgent, schemaId: string): Promise<string[]> {
    const schemaResolutionResult = await tenantAgent.modules.anoncreds.getSchema(schemaId)

    if (schemaResolutionResult.resolutionMetadata.error || !schemaResolutionResult.schema) {
      throw new UnprocessableEntityException(
        `Cannot resolve schema with ID. Error: ${
          schemaResolutionResult.resolutionMetadata.error ?? 'unknown'
        }. Details: ${schemaResolutionResult.resolutionMetadata.message ?? 'N/A'}`,
      )
    }

    return schemaResolutionResult.schema.attrNames
  }

  private async buildRequest(tenantAgent: TenantAgent, params: ProofRequestDto) {
    switch (params.request.format) {
      case ProofRequestFormat.AnoncredsIndy: {
        const proofReqParams = await this.prepareProofReqParams(tenantAgent, params.request.proofParams)

        const now = Math.floor(Date.now() / 1000)
        const nonRevoked = params.requestNonRevokedProof ? { from: now, to: now } : undefined

        return {
          anoncreds: {
            name: params.request.name,
            version: '1.0',
            requested_attributes: proofReqParams.requestedAttributes,
            requested_predicates: proofReqParams.requestedPredicates,
            non_revoked: nonRevoked,
          },
        }
      }
      case ProofRequestFormat.DifPresentationExchange: {
        return {
          presentationExchange: {
            presentationDefinition: params.request.presentationExchange!,
          },
        }
      }
    }
  }
}

function createRequestedAttributes(
  requestedAttributeDtos: RequestedAttributeDto[],
): Record<string, AnonCredsRequestedAttribute> {
  return requestedAttributeDtos.reduce<Record<string, AnonCredsRequestedAttribute>>(
    (record, attribute) => ({
      ...record,
      [attribute.name]: {
        name: attribute.name,
        restrictions: [{ schema_id: attribute.schemaId, cred_def_id: attribute.credentialDefinitionId }],
      },
    }),
    {},
  )
}

function createRequestedPredicates(
  requestedPredicateDtos: RequestedPredicateDto[],
): Record<string, AnonCredsRequestedPredicate> {
  return requestedPredicateDtos.reduce<Record<string, AnonCredsRequestedPredicate>>(
    (record, predicate) => ({
      ...record,
      [predicate.name]: {
        name: predicate.name,
        p_type: predicate.type,
        p_value: predicate.value,
        restrictions: [{ schema_id: predicate.schemaId, cred_def_id: predicate.credentialDefinitionId }],
      },
    }),
    {},
  )
}

function createRequestedAttributesWithSchemaId(
  attrNames: string[],
  schemaId: string,
): Record<string, AnonCredsRequestedAttribute> {
  return attrNames.reduce<Record<string, AnonCredsRequestedAttribute>>(
    (record, attrName) => ({
      ...record,
      [attrName]: { name: attrName, restrictions: [{ schema_id: schemaId }] },
    }),
    {},
  )
}

function createRequestedAttributesWithCredDefId(
  attrNames: string[],
  credDefId: string,
): Record<string, AnonCredsRequestedAttribute> {
  return attrNames.reduce<Record<string, AnonCredsRequestedAttribute>>(
    (record, attrName) => ({
      ...record,
      [attrName]: { name: attrName, restrictions: [{ cred_def_id: credDefId }] },
    }),
    {},
  )
}
