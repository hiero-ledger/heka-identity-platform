import type { DidDocument, DidDocumentKey } from '@credo-ts/core'

import { getPublicJwkFromVerificationMethod, Kms } from '@credo-ts/core'

import { signingKeyCandidates } from '../../utils/oid4vc'
import { TenantAgent } from '../agent'

export interface SelectedSigningKey {
  // The verification method to sign with (absolute DID URL)
  didUrl?: string
  // Why the methods of the right purposes cannot be used, when there are some but none qualifies
  unusable?: string
}

/**
 * The key an OpenID4VC credential or request is signed with: the first verification method of `didDocument`, the
 * document the DID's ledger has, that every one of `purposes` references (and that is `keyId` when one is named), and
 * that this wallet can sign with in a way verifiers accept. That holds when the ledger, the wallet's record of the DID
 * and the wallet's KMS agree on its public key:
 * - Credo signs with the method as the wallet's record has it (`resolveVerificationMethodFromCreatedDidRecord`);
 * - and with the KMS key the record maps to it, or the legacy key id of its public key.
 *
 * A method added outside this wallet, one whose key was replaced on the ledger, or one that landed on the ledger after
 * its update failed (no key mapping) is never chosen. Nothing is written here: offers do not hold the wallet lock, and
 * DID updates bring the record in line with the ledger.
 */
export async function selectSigningKey(
  tenantAgent: TenantAgent,
  didDocument: DidDocument,
  purposes: Array<'assertionMethod' | 'authentication'>,
  keyId?: string,
): Promise<SelectedSigningKey> {
  const candidates = signingKeyCandidates(didDocument, purposes, keyId)
  if (!candidates.length) {
    return {}
  }
  const [didRecord] = await tenantAgent.dids.getCreatedDids({ did: didDocument.id })
  if (!didRecord) {
    return { unusable: 'the DID was not created in this wallet' }
  }
  // Without a stored document Credo signs from the resolved one
  const recordDocument = didRecord.didDocument ?? didDocument

  const reasons = new Set<string>()
  for (const didUrl of candidates) {
    const reason = await unusableBecause(tenantAgent, didUrl, didDocument, recordDocument, didRecord.keys ?? [])
    if (!reason) {
      return { didUrl }
    }
    reasons.add(reason)
  }
  return { unusable: [...reasons].join('; ') }
}

async function unusableBecause(
  tenantAgent: TenantAgent,
  didUrl: string,
  ledgerDocument: DidDocument,
  recordDocument: DidDocument,
  keys: DidDocumentKey[],
): Promise<string | undefined> {
  const onLedger = publicKeyOf(ledgerDocument, didUrl)
  if (!onLedger) {
    return 'its key type is not supported for signing'
  }
  const inRecord = publicKeyOf(recordDocument, didUrl)
  if (!inRecord || inRecord.fingerprint !== onLedger.fingerprint) {
    return "the wallet's record of the DID differs from its ledger; a DID update brings it in line"
  }
  const kmsKeyId =
    keys.find(({ didDocumentRelativeKeyId }) => didUrl.endsWith(didDocumentRelativeKeyId))?.kmsKeyId ??
    inRecord.legacyKeyId
  let held: Kms.PublicJwk
  try {
    const jwk = await tenantAgent.kms.getPublicKey({ keyId: kmsKeyId })
    Kms.assertJwkAsymmetric(jwk)
    held = Kms.PublicJwk.fromPublicJwk(jwk)
  } catch {
    return 'this wallet holds no key for it'
  }
  return held.fingerprint === onLedger.fingerprint ? undefined : "this wallet's key for it differs from the ledger's"
}

function publicKeyOf(didDocument: DidDocument, didUrl: string): Kms.PublicJwk | undefined {
  const absolute = (id: string) => (id.startsWith('#') ? `${didDocument.id}${id}` : id)
  const verificationMethod = didDocument.verificationMethod?.find(({ id }) => absolute(id) === didUrl)
  if (!verificationMethod) {
    return undefined
  }
  try {
    return getPublicJwkFromVerificationMethod(verificationMethod)
  } catch {
    return undefined
  }
}
