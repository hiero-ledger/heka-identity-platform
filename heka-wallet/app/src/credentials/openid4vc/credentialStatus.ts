import type { HekaWalletAgent } from '../../utils/agent'
import type { CredentialRecord } from '../types'
import type { SdJwtVcRecord } from '@credo-ts/core'

export enum CredentialStatus {
  Valid = 'valid',
  Revoked = 'revoked',
  /** The status could not be checked (status list unreachable, issuer not resolvable, other verification error). */
  Unknown = 'unknown',
}

/** Upper bound for the whole post-rejection status check, including issuer DID resolution. */
export const STATUS_CHECK_TIMEOUT_MS = 10_000

/**
 * True only for the error @sd-jwt/sd-jwt-vc's default `statusValidator` throws when the status list entry is
 * not 0 (VALID): `new SDJWTException('Status is not valid')`. Credo's `sdJwtVc.verify` returns it unwrapped.
 * Other failures, such as Credo's status list fetch error (which embeds the server's response body), must not
 * match, so both the error name and the whole message are compared.
 */
export function isInvalidStatusError(error: unknown): boolean {
  return error instanceof Error && error.name === 'SDJWTException' && error.message === 'Status is not valid'
}

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

    if (isInvalidStatusError(result.error)) {
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
 * are skipped. If the check takes longer than `timeoutMs`, no credential is reported as revoked.
 */
export async function findRevokedCredentialIds(
  agent: HekaWalletAgent,
  records: CredentialRecord[],
  { timeoutMs = STATUS_CHECK_TIMEOUT_MS }: { timeoutMs?: number } = {}
): Promise<string[]> {
  const uniqueSdJwtVcRecords = [
    ...new Map(records.filter(isSdJwtVcRecord).map((record) => [record.id, record])).values(),
  ]
  if (uniqueSdJwtVcRecords.length === 0) {
    return []
  }

  let timer: ReturnType<typeof setTimeout> | undefined
  const timedOut = new Promise<undefined>((resolve) => {
    timer = setTimeout(() => resolve(undefined), timeoutMs)
  })

  try {
    const statuses = await Promise.race([
      Promise.all(
        uniqueSdJwtVcRecords.map(async (record) => ({ id: record.id, status: await getSdJwtVcStatus(agent, record) }))
      ),
      timedOut,
    ])

    if (!statuses) {
      agent.config.logger.warn('Timed out checking the status of SD-JWT VCs', {
        timeoutMs,
        credentialCount: uniqueSdJwtVcRecords.length,
      })
      return []
    }

    return statuses.filter(({ status }) => status === CredentialStatus.Revoked).map(({ id }) => id)
  } finally {
    clearTimeout(timer)
  }
}
