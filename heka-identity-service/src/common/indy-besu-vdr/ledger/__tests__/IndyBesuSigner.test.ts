import { AskarStoreManager } from '@credo-ts/askar'
import { AgentContext, Kms, TypedArrayEncoder } from '@credo-ts/core'
import { getBytes, hexlify, keccak256, recoverAddress, Signature, SigningKey, toUtf8Bytes } from 'ethers'

import { INSECURE_DEFAULTS } from 'config/insecure-defaults'

import { IndyBesuSigner } from '../IndyBesuSigner'

// The dev endorser key, a Trustee on the local Indy-Besu network
const DEV_PRIVATE_KEY = INSECURE_DEFAULTS.INDY_BESU_ENDORSER_PRIVATE_KEY
const DEV_ADDRESS = '0x627306090abaB3A6e1400e9345bC60c78a8BEf57'

function secp256k1PublicJwk(privateKeyHex: string): Kms.KmsJwkPublicAsymmetric {
  const uncompressed = getBytes(new SigningKey(`0x${privateKeyHex}`).publicKey)
  return {
    kty: 'EC',
    crv: 'secp256k1',
    x: TypedArrayEncoder.toBase64Url(uncompressed.slice(1, 33)),
    y: TypedArrayEncoder.toBase64Url(uncompressed.slice(33, 65)),
  }
}

describe('IndyBesuSigner', () => {
  let publicJwk: Kms.KmsJwkPublicAsymmetric
  let secretBytes: Uint8Array
  let free: ReturnType<typeof vi.fn>
  let fetchKey: ReturnType<typeof vi.fn>
  let agentContext: AgentContext

  beforeEach(() => {
    publicJwk = secp256k1PublicJwk(DEV_PRIVATE_KEY)
    secretBytes = TypedArrayEncoder.fromHex(DEV_PRIVATE_KEY)
    free = vi.fn()
    fetchKey = vi.fn(() => Promise.resolve({ key: { secretBytes, handle: { free } } }))
    const kms = { getPublicKey: vi.fn(() => Promise.resolve(publicJwk)) }
    const storeManager = {
      withSession: vi.fn((_context: unknown, callback: (session: unknown) => unknown) =>
        Promise.resolve(callback({ fetchKey })),
      ),
    }
    agentContext = {
      dependencyManager: {
        resolve: vi.fn((token: unknown) => (token === AskarStoreManager ? storeManager : kms)),
      },
    } as unknown as AgentContext
  })

  test('derives the Ethereum address from the secp256k1 public key', async () => {
    const signer = await IndyBesuSigner.create(agentContext, 'endorser')

    expect(signer.address).toBe(DEV_ADDRESS)
  })

  test('signs the raw digest with a recovery id, recoverable to the signer address', async () => {
    const signer = await IndyBesuSigner.create(agentContext, 'endorser')
    const digest = getBytes(keccak256(toUtf8Bytes('hello')))

    const { recovery_id, signature } = await signer.sign(digest)

    expect([0, 1]).toContain(recovery_id)
    expect(signature).toBeInstanceOf(Uint8Array)
    expect(signature).toHaveLength(64)
    const recovered = recoverAddress(
      digest,
      Signature.from({
        r: hexlify(signature.slice(0, 32)),
        s: hexlify(signature.slice(32)),
        yParity: recovery_id as 0 | 1,
      }),
    )
    expect(recovered).toBe(DEV_ADDRESS)
    expect(fetchKey).toHaveBeenCalledWith({ name: 'endorser' })
  })

  // Best effort: ethers' SigningKey keeps its own copy of the secret, which cannot be wiped
  test('frees the Askar key handle and zeroes the secret buffer it read after signing', async () => {
    const signer = await IndyBesuSigner.create(agentContext, 'endorser')

    await signer.sign(getBytes(keccak256(toUtf8Bytes('hello'))))

    expect(free).toHaveBeenCalledTimes(1)
    expect(secretBytes.every((byte) => byte === 0)).toBe(true)
  })

  test('sets `{ recovery_id, signature }` on a transaction, signing its signing bytes', async () => {
    const signer = await IndyBesuSigner.create(agentContext, 'endorser')
    const digest = getBytes(keccak256(toUtf8Bytes('transaction')))
    const transaction = { getSigningBytes: vi.fn(() => digest), setSignature: vi.fn() }

    await signer.signTransaction(transaction as never)

    expect(transaction.setSignature).toHaveBeenCalledWith({
      recovery_id: expect.any(Number),
      signature: expect.any(Uint8Array),
    })
  })

  test('rejects a key that is not secp256k1', async () => {
    publicJwk = { kty: 'OKP', crv: 'Ed25519', x: TypedArrayEncoder.toBase64Url(new Uint8Array(32).fill(1)) }

    await expect(IndyBesuSigner.create(agentContext, 'ed25519')).rejects.toThrow(
      'Indy-Besu signer requires a secp256k1 key',
    )
  })

  test('rejects a digest that is not 32 bytes', async () => {
    const signer = await IndyBesuSigner.create(agentContext, 'endorser')

    await expect(signer.sign(toUtf8Bytes('hello'))).rejects.toThrow('32-byte digest')
    expect(fetchKey).not.toHaveBeenCalled()
  })

  test('fails before anything is sent when the stored secret does not belong to the public key', async () => {
    const signer = await IndyBesuSigner.create(agentContext, 'endorser')
    secretBytes = TypedArrayEncoder.fromHex('11'.repeat(32))

    await expect(signer.sign(getBytes(keccak256(toUtf8Bytes('hello'))))).rejects.toThrow(
      'Indy-Besu signature does not recover the signer address',
    )
    expect(free).toHaveBeenCalledTimes(1)
  })

  test('fails when the key is not in the store', async () => {
    const signer = await IndyBesuSigner.create(agentContext, 'endorser')
    fetchKey.mockResolvedValue(null)

    await expect(signer.sign(getBytes(keccak256(toUtf8Bytes('hello'))))).rejects.toThrow(
      'Indy-Besu signer key not found',
    )
  })
})
