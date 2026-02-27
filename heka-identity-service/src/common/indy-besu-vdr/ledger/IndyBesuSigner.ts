import { Buffer, TypedArrayEncoder, Kms } from '@credo-ts/core'
import { BytesLike, computeAddress, getBytes } from 'ethers'
import { Transaction, TransactionEndorsingData } from 'indybesu-vdr'

export class IndyBesuSigner {
  public readonly keyId!: string
  public readonly address!: string
  private readonly kms!: Kms.KeyManagementApi

  private constructor(keyId: string, publicKey: string, kms: Kms.KeyManagementApi) {
    this.keyId = keyId
    this.address = computeAddress(`0x${TypedArrayEncoder.toHex(Buffer.from(publicKey))}`)
    this.kms = kms
  }

  public static async create(keyId: string, kms: Kms.KeyManagementApi) {
    const publicKey = await kms.getPublicKey({ keyId })
    Kms.assertJwkAsymmetric(publicKey)

    const publicJwk = Kms.PublicJwk.fromPublicJwk(publicKey)
    return new IndyBesuSigner(keyId, publicJwk.fingerprint, kms)
  }

  public async signTransaction(transaction: Transaction | TransactionEndorsingData) {
    const bytesToSign = transaction.getSigningBytes()
    const signature = await this.sign(bytesToSign)
    // TODO: Check it
    transaction.setSignature(signature)
    // transaction.setSignature({
    //   recovery_id: signature.yParity,
    //   signature: getBytes(concat([signature.r, signature.s])),
    // })
  }

  // Since the Askar library does not return a recovery ID, we have to use the Ethers library for signing.
  public async sign(data: BytesLike): Promise<Uint8Array> {
    const keyEntry = await this.kms.getPublicKey({ keyId: this.keyId })
    if (!keyEntry) {
      throw new Error('KeyId not found')
    }

    const signResult = await this.kms.sign({
      algorithm: 'EdDSA',
      keyId: this.keyId,
      data: getBytes(data),
    })

    return signResult.signature

    // return await this.kms.withSession(async (session) => {
    //   const keyEntry = await session.fetchKey({ name: this.key.publicKeyBase58 })
    //
    //   if (!keyEntry) {
    //     throw new WalletError('Key entry not found')
    //   }
    //   const key = new SigningKey(keyEntry.key.secretBytes)
    //
    //   const signature = key.sign(data)
    //   keyEntry.key.handle.free()
    //   return signature
    // })
  }
}
