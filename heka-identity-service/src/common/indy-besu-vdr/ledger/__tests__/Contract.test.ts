import type { LedgerClient, Transaction } from 'indybesu-vdr'

import { Contract, TransactionOutcomeUnknownError } from '../contracts/Contract'
import { IndyBesuSigner } from '../IndyBesuSigner'

describe('Contract.signAndSubmit', () => {
  const transaction = {} as Transaction
  let client: { submitTransaction: ReturnType<typeof vi.fn>; getReceipt: ReturnType<typeof vi.fn> }
  let signer: { signTransaction: ReturnType<typeof vi.fn> }
  let contract: Contract

  beforeEach(() => {
    client = {
      submitTransaction: vi.fn().mockResolvedValue('0xhash'),
      getReceipt: vi.fn().mockResolvedValue('receipt'),
    }
    signer = { signTransaction: vi.fn().mockResolvedValue(undefined) }
    contract = new Contract(client as unknown as LedgerClient)
  })

  const submit = () => contract.signAndSubmit(transaction, signer as unknown as IndyBesuSigner)

  test('returns the receipt of the submitted transaction', async () => {
    await expect(submit()).resolves.toBe('receipt')
    expect(client.getReceipt).toHaveBeenCalledWith('0xhash')
  })

  test('a signing error is passed on as is: nothing was sent', async () => {
    const error = new Error('key not available')
    signer.signTransaction.mockRejectedValue(error)

    await expect(submit()).rejects.toBe(error)
    expect(client.submitTransaction).not.toHaveBeenCalled()
  })

  test.each([
    ['the submission', 'submitTransaction'],
    ['waiting for the receipt', 'getReceipt'],
  ] as const)('a failure of %s leaves the outcome unknown, with the original message', async (_case, call) => {
    client[call].mockRejectedValue(new Error('Ledger Client: timeout'))

    const failure = submit()

    await expect(failure).rejects.toBeInstanceOf(TransactionOutcomeUnknownError)
    await expect(failure).rejects.toThrow('Ledger Client: timeout')
  })
})
