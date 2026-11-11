import 'reflect-metadata'

import {
  DifPresentationExchangeDefinitionV1,
  DifPresentationExchangeService,
  W3cCredentialService,
} from '@credo-ts/core'
import { createMock } from '@golevelup/ts-vitest'
import { ValidationPipe } from '@nestjs/common'

import { TenantAgent } from 'common/agent'

import { connectionRecordStub, proofExchangeRecordStub } from '../../../test/helpers/mock-records'
import { ProofRequestDto } from '../dto/proof-request.dto'
import { ProofService } from '../proof.service'

/** The global pipe of `src/app.starter.ts` */
const validationPipe = new ValidationPipe({
  transform: true,
  transformOptions: { enableImplicitConversion: true },
  whitelist: true,
  forbidNonWhitelisted: true,
})

const transformBody = (body: Record<string, unknown>): Promise<ProofRequestDto> =>
  validationPipe.transform(body, { type: 'body', metatype: ProofRequestDto })

/** The anoncreds-w3c (Data Integrity) request the Web UI sends */
const anonCredsW3cProofRequestBody = () => ({
  connectionId: 'conn-1',
  comment: 'Passport',
  request: {
    format: 'dif-presentation-exchange',
    presentationExchange: {
      id: 'definition-1',
      name: 'Passport',
      purpose: 'Passport',
      input_descriptors: [
        {
          id: 'descriptor-1',
          name: 'Passport',
          schema: [{ uri: 'https://www.w3.org/2018/credentials/v1' }],
          constraints: {
            limit_disclosure: 'required',
            statuses: { active: { directive: 'required' } },
            fields: [{ path: ['$.credentialSubject.name'] }],
          },
        },
      ],
    },
  },
})

/** Credo's own presentation definition validation (PEX), as run by the DIF PE format service in createRequest */
const validateWithCredo = (presentationDefinition: DifPresentationExchangeDefinitionV1) =>
  new DifPresentationExchangeService({} as W3cCredentialService).validatePresentationDefinition(presentationDefinition)

describe('ProofRequestDto with a DIF Presentation Exchange request', () => {
  let tenantAgent: TenantAgent

  /** Sends the body through the global pipe and the service, and returns what reached Credo's requestProof */
  const forwardedDefinition = async (body: Record<string, unknown>) => {
    const dto = await transformBody(body)
    await new ProofService().request(tenantAgent, dto)

    const requestProof = vi.mocked(tenantAgent.didcomm.proofs.requestProof)
    const { proofFormats } = requestProof.mock.calls[0][0] as {
      proofFormats: { presentationExchange: { presentationDefinition: DifPresentationExchangeDefinitionV1 } }
    }
    return proofFormats.presentationExchange.presentationDefinition
  }

  beforeEach(() => {
    tenantAgent = createMock<TenantAgent>({
      didcomm: {
        proofs: { requestProof: vi.fn() },
        connections: { findById: vi.fn() },
      },
    })
    vi.mocked(tenantAgent.didcomm.connections.findById).mockResolvedValue(connectionRecordStub({ id: 'conn-1' }))
    vi.mocked(tenantAgent.didcomm.proofs.requestProof).mockResolvedValue(
      proofExchangeRecordStub({ id: 'proof-1', state: 'request-sent', createdAt: new Date() }),
    )
  })

  test('passes constraints.statuses through the global validation pipe to Credo unchanged', async () => {
    const body = anonCredsW3cProofRequestBody()

    const presentationDefinition = await forwardedDefinition(body)

    // Credo's AnonCredsDataIntegrityService.descriptorRequiresRevocationStatus reads exactly this path
    expect(presentationDefinition.input_descriptors[0].constraints?.statuses).toEqual({
      active: { directive: 'required' },
    })
    // Nothing else of the definition is dropped or renamed either
    expect(JSON.parse(JSON.stringify(presentationDefinition))).toEqual(body.request.presentationExchange)
  })

  test('the forwarded definition passes the presentation definition validation Credo runs in createRequest', async () => {
    const presentationDefinition = await forwardedDefinition(anonCredsW3cProofRequestBody())

    expect(() => validateWithCredo(presentationDefinition)).not.toThrow()
  })

  test('an unknown status directive is not stripped, so Credo rejects the definition instead of ignoring it', async () => {
    const body = anonCredsW3cProofRequestBody()
    body.request.presentationExchange.input_descriptors[0].constraints.statuses = {
      active: { directive: 'sometimes' },
    }
    const presentationDefinition = await forwardedDefinition(body)

    expect(presentationDefinition.input_descriptors[0].constraints?.statuses?.active?.directive).toBe('sometimes')
    expect(() => validateWithCredo(presentationDefinition)).toThrow(
      /statuses\/active\/directive: must be equal to one of the allowed values/,
    )
  })
})
