import { mapCredentialRecord } from '../../../src/credentials/mappers/credential'
import { mapAnoncredsProofExchangeRecord } from '../../../src/credentials/mappers/presentation'
import { ProofExchangeFormatKeys } from '../../../src/credentials/types'
import { HekaWalletAgent } from '../../../src/utils/agent'

import { mockFunction } from '../../../../jest-helpers/helpers'

jest.mock('@bifold/oca/build/legacy', () => ({}))
jest.mock('@bifold/verifier', () => ({}))
jest.mock('@credo-ts/anoncreds', () => ({}))
jest.mock('@credo-ts/core', () => ({
  ClaimFormat: {},
  DifPresentationExchangeService: class DifPresentationExchangeService {},
}))
jest.mock('@credo-ts/didcomm', () => ({
  DidCommCredentialExchangeRepository: class DidCommCredentialExchangeRepository {},
}))

jest.mock('../../../src/credentials/mappers/credential', () => ({ mapCredentialRecord: jest.fn() }))
jest.mock('../../../src/credentials/mappers/mdoc', () => ({}))
jest.mock('../../../src/credentials/mappers/sd-jwt', () => ({}))
jest.mock('../../../src/credentials/mappers/utils', () => ({ parseCredentialName: () => 'Credential' }))

const CRED_DEF_ID = 'did:hedera:testnet:issuer/anoncreds/v0/CLAIM_DEF/1/diploma'
const REVOCATION_DATE = new Date('2026-11-10T10:00:00Z')

const proofRequest = {
  name: 'Proof of education',
  non_revoked: { to: 1762770000 },
  requested_attributes: {
    diploma: { names: ['name', 'degree'], restrictions: [{ cred_def_id: CRED_DEF_ID }] },
  },
  requested_predicates: {},
}

type Match = { credentialId: string; revealed: boolean; revoked?: boolean }

const exchangeRecord = (id: string, credentialId: string, revoked: boolean) => ({
  id,
  credentials: [{ credentialRecordType: 'w3c', credentialRecordId: credentialId }],
  revocationNotification: revoked ? { revocationDate: REVOCATION_DATE } : undefined,
})

const credentialFor = (record: { id: string }) => ({
  id: record.id,
  record,
  display: {
    name: record.id === 'revoked-exchange' ? 'University Diploma (revoked)' : 'University Diploma',
    issuer: { name: 'University' },
    attributes: [
      { name: 'name', value: 'Alice' },
      { name: 'degree', value: 'Bachelor' },
      { name: 'id', value: '42' },
    ],
  },
})

function createAgent({
  matches,
  exchanges,
  format = 'anoncreds',
}: {
  matches: Match[]
  exchanges: ReturnType<typeof exchangeRecord>[]
  format?: 'anoncreds' | 'indy'
}) {
  const getCredentialsForRequest = jest.fn().mockResolvedValue({
    proofFormats: { [format]: { attributes: { diploma: matches }, predicates: {} } },
  })
  const findByQuery = jest.fn().mockResolvedValue(exchanges)
  const agent = {
    context: {},
    dependencyManager: { resolve: () => ({ findByQuery }) },
    didcomm: {
      proofs: {
        getFormatData: jest.fn().mockResolvedValue({ request: { [format]: proofRequest } }),
        getCredentialsForRequest,
      },
      connections: { getById: jest.fn() },
      oob: { getById: jest.fn() },
    },
  }
  return { agent: agent as unknown as HekaWalletAgent, getCredentialsForRequest }
}

const proofExchangeRecord = { id: 'proof-id' } as never

describe('mapAnoncredsProofExchangeRecord', () => {
  beforeEach(() => {
    mockFunction(mapCredentialRecord).mockImplementation(async (record) => credentialFor(record) as never)
  })

  it('asks Credo for revoked credentials too', async () => {
    const { agent, getCredentialsForRequest } = createAgent({ matches: [], exchanges: [] })

    await mapAnoncredsProofExchangeRecord(proofExchangeRecord, agent)

    expect(getCredentialsForRequest).toBeCalledWith({
      proofExchangeRecordId: 'proof-id',
      proofFormats: { anoncreds: { filterByNonRevocationRequirements: false } },
    })
  })

  it('uses the indy format key for an indy proof request', async () => {
    const { agent, getCredentialsForRequest } = createAgent({ matches: [], exchanges: [], format: 'indy' })

    const submission = await mapAnoncredsProofExchangeRecord(proofExchangeRecord, agent)

    expect(submission.formatKey).toBe(ProofExchangeFormatKeys.Indy)
    expect(getCredentialsForRequest).toBeCalledWith({
      proofExchangeRecordId: 'proof-id',
      proofFormats: { indy: { filterByNonRevocationRequirements: false } },
    })
  })

  it('names the revoked credential that would satisfy the request', async () => {
    const { agent } = createAgent({
      matches: [{ credentialId: 'cred-revoked', revealed: true, revoked: true }],
      exchanges: [exchangeRecord('revoked-exchange', 'cred-revoked', true)],
    })

    const submission = await mapAnoncredsProofExchangeRecord(proofExchangeRecord, agent)

    expect(submission.areAllSatisfied).toBe(false)
    expect(submission.entries).toHaveLength(1)
    const [entry] = submission.entries
    expect(entry.isSatisfied).toBe(false)
    expect(entry.selectedOption).toBeNull()
    expect(entry.submissionOptions).toEqual([])
    expect(entry.revokedCredential?.credential.display.name).toBe('University Diploma (revoked)')
    expect(entry.revokedCredential?.revocationDate).toBe(REVOCATION_DATE)
    // The revoked credential can never be selected for sharing
    expect(submission.entriesWithAnoncredsMatches.get(entry.inputDescriptorId)?.matches).toEqual([])
  })

  it('keeps a genuinely missing credential as missing', async () => {
    const { agent } = createAgent({ matches: [], exchanges: [] })

    const submission = await mapAnoncredsProofExchangeRecord(proofExchangeRecord, agent)

    const [entry] = submission.entries
    expect(entry.isSatisfied).toBe(false)
    expect(entry.name).toBe('Credential')
    expect(entry.revokedCredential).toBeUndefined()
    expect(mapCredentialRecord).not.toBeCalled()
  })

  it('keeps the entry missing when the revoked credential has no exchange record', async () => {
    const { agent } = createAgent({
      matches: [{ credentialId: 'cred-revoked', revealed: true, revoked: true }],
      exchanges: [],
    })

    const submission = await mapAnoncredsProofExchangeRecord(proofExchangeRecord, agent)

    expect(submission.entries[0].isSatisfied).toBe(false)
    expect(submission.entries[0].revokedCredential).toBeUndefined()
  })

  it('offers a valid credential as before and ignores a revoked one next to it', async () => {
    const { agent } = createAgent({
      matches: [
        { credentialId: 'cred-valid', revealed: true, revoked: false },
        { credentialId: 'cred-revoked', revealed: true, revoked: true },
      ],
      exchanges: [
        exchangeRecord('valid-exchange', 'cred-valid', false),
        exchangeRecord('revoked-exchange', 'cred-revoked', true),
      ],
    })

    const submission = await mapAnoncredsProofExchangeRecord(proofExchangeRecord, agent)

    expect(submission.areAllSatisfied).toBe(true)
    const [entry] = submission.entries
    expect(entry.inputDescriptorId).toBe('cred-valid')
    expect(entry.isSatisfied).toBe(true)
    expect(entry.revokedCredential).toBeUndefined()
    expect(entry.submissionOptions.map((option) => option.credential.id)).toEqual(['valid-exchange'])
    expect(entry.selectedOption?.requestedAttributes?.map((attribute) => attribute.name)).toEqual(['name', 'degree'])
    expect(submission.entriesWithAnoncredsMatches.get('cred-valid')?.matches).toEqual([
      { credentialId: 'cred-valid', revealed: true, revoked: false },
    ])
  })

  it('offers a credential without revocation support (revoked undefined) as before', async () => {
    const { agent } = createAgent({
      matches: [{ credentialId: 'cred-valid', revealed: true }],
      exchanges: [exchangeRecord('valid-exchange', 'cred-valid', false)],
    })

    const submission = await mapAnoncredsProofExchangeRecord(proofExchangeRecord, agent)

    expect(submission.areAllSatisfied).toBe(true)
    expect(submission.entries[0].selectedOption?.credential.id).toBe('valid-exchange')
  })
})
