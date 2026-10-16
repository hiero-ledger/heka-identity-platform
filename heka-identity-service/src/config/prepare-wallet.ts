import { registerAs } from '@nestjs/config'

export default registerAs('prepareWallet', () => {
  const lockTimeout = process.env.PREPARE_WALLET_LOCK_TIMEOUT
    ? parseInt(process.env.PREPARE_WALLET_LOCK_TIMEOUT, 10)
    : NaN
  return {
    // Seconds a `POST /prepare-wallet` call waits for another call preparing the same wallet, on any instance,
    // before it gives up with 503
    lockTimeout: Number.isInteger(lockTimeout) && lockTimeout > 0 ? lockTimeout : 300,
  }
})
