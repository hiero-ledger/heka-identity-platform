import type { HekaWalletAgent } from '../../utils/agent'
import type { CredentialRecord } from '../types'
import type { SdJwtVcRecord } from '@credo-ts/core'

export enum CredentialStatus {
  Valid = 'valid',
  Revoked = 'revoked',
  /** The status could not be checked (status list unreachable, issuer not resolvable, other verification error). */
  Unknown = 'unknown',
}

// Message of the error @sd-jwt/sd-jwt-vc throws when the status list entry is not 0 (VALID).
const INVALID_STATUS_MESSAGE = /status is not valid/i

function isSdJwtVcRecord(record: CredentialRecord): record is SdJwtVcRecord {
  return record.type === 'SdJwtVcRecord'
}

/**
 * Checks the IETF Token Status List entry of an SD-JWT VC with Credo's own verification, which fetches the
 * status list from `status.status_list.uri`, verifies its signature with the issuer key and reads the entry
 * at `status.status_list.idx`. Credentials without a status list entry are reported as valid.
 */
export async function getSdJwtVcStatus(agent: HekaWalletAgent, record: SdJwtVcRecord): Promise<CredentialStatus> {
  const logUnknownStatus = (error: unknown) =>
    agent.config.logger.warn('Could not verify the status of an SD-JWT VC', {
      credentialRecordId: record.id,
      error: (error as Error | undefined)?.message,
    })

  try {
    const credential = record.firstCredential
    const status = credential.payload.status as { status_list?: unknown } | undefined
    if (!status?.status_list) {
      return CredentialStatus.Valid
    }

    const result = await agent.sdJwtVc.verify({ compactSdJwtVc: credential.compact })
    if (result.isValid) {
      return CredentialStatus.Valid
    }

    if (INVALID_STATUS_MESSAGE.test(result.error?.message ?? '')) {
      return CredentialStatus.Revoked
    }

    logUnknownStatus(result.error)
    return CredentialStatus.Unknown
  } catch (error) {
    logUnknownStatus(error)
    return CredentialStatus.Unknown
  }
}

/**
 * Returns the ids of the given records that are SD-JWT VCs revoked by their issuer. Other credential formats
 * are skipped.
 */
export async function findRevokedCredentialIds(agent: HekaWalletAgent, records: CredentialRecord[]): Promise<string[]> {
  const uniqueSdJwtVcRecords = [
    ...new Map(records.filter(isSdJwtVcRecord).map((record) => [record.id, record])).values(),
  ]

  const statuses = await Promise.all(
    uniqueSdJwtVcRecords.map(async (record) => ({ id: record.id, status: await getSdJwtVcStatus(agent, record) }))
  )

  return statuses.filter(({ status }) => status === CredentialStatus.Revoked).map(({ id }) => id)
}
