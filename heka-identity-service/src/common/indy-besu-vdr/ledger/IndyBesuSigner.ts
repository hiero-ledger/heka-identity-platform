import { AskarStoreManager } from '@credo-ts/askar'
import { AgentContext, CredoError, Kms } from '@credo-ts/core'
import { computeAddress, concat, getBytes, recoverAddress, Signature, SigningKey } from 'ethers'

import { Transaction, TransactionEndorsingData } from 'indybesu-vdr'

import { addressFromPublicJwk } from '../utils/address'

/** The shape the VDR deserializes into `SignatureData`: `r‖s` and the recovery id (0 or 1). */
export interface IndyBesuSignature {
  recovery_id: number
  signature: Uint8Array
}

/**
 * Signs Indy-Besu transactions and endorsing data with a secp256k1 key of the agent's KMS, or with a configured key.
 *
 * The ledger recovers the signer from a signature over the raw keccak digest that `getSigningBytes()` returns, and
 * needs the recovery id. The KMS cannot produce that: Askar's ES256K signs SHA-256 of its input and returns no recovery
 * id, so every signature would recover a different address.
 */
export class IndyBesuSigner {
  public readonly address: string

  private readonly signDigest: (digest: Uint8Array) => Promise<Signature>

  private constructor(address: string, signDigest: (digest: Uint8Array) => Promise<Signature>) {
    this.address = address
    this.signDigest = signDigest
  }

  /** Signer of a secp256k1 key in the agent's wallet. */
  public static async create(agentContext: AgentContext, keyId: string): Promise<IndyBesuSigner> {
    const kms = agentContext.dependencyManager.resolve(Kms.KeyManagementApi)
    const jwk = await kms.getPublicKey({ keyId })
    Kms.assertJwkAsymmetric(jwk)
    const publicJwk = Kms.PublicJwk.fromPublicJwk(jwk)
    if (!publicJwk.is(Kms.Secp256k1PublicJwk)) {
      throw new CredoError('Indy-Besu signer requires a secp256k1 key')
    }

    return new IndyBesuSigner(addressFromPublicJwk(publicJwk), (digest) =>
      signWithWalletKey(agentContext, keyId, digest),
    )
  }

  /** Signer of a configured account, such as the platform endorser, that is not kept in any tenant wallet. */
  public static fromPrivateKey(privateKey: string): IndyBesuSigner {
    const signingKey = new SigningKey(privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`)
    return new IndyBesuSigner(computeAddress(signingKey.publicKey), (digest) =>
      Promise.resolve(signingKey.sign(digest)),
    )
  }

  public async signTransaction(transaction: Transaction | TransactionEndorsingData): Promise<void> {
    transaction.setSignature(await this.sign(transaction.getSigningBytes()))
  }

  public async sign(digest: Uint8Array): Promise<IndyBesuSignature> {
    if (digest.length !== 32) {
      throw new CredoError('Indy-Besu signer expects a 32-byte digest')
    }

    const signature = await this.signDigest(digest)

    // A wrong key would only be noticed by the ledger, after the transaction has been sent
    if (recoverAddress(digest, signature) !== this.address) {
      throw new CredoError('Indy-Besu signature does not recover the signer address')
    }

    return {
      recovery_id: signature.yParity,
      signature: getBytes(concat([signature.r, signature.s])),
    }
  }
}

async function signWithWalletKey(agentContext: AgentContext, keyId: string, digest: Uint8Array): Promise<Signature> {
  const storeManager = agentContext.dependencyManager.resolve(AskarStoreManager)
  const keyEntry = await storeManager.withSession(agentContext, (session) => session.fetchKey({ name: keyId }))
  if (!keyEntry) {
    throw new CredoError('Indy-Besu signer key not found')
  }

  let secret: Uint8Array | undefined
  try {
    secret = keyEntry.key.secretBytes
    return new SigningKey(secret).sign(digest)
  } finally {
    // Best effort only: the SigningKey's internal copy of the secret cannot be wiped
    secret?.fill(0)
    keyEntry.key.handle.free()
  }
}
