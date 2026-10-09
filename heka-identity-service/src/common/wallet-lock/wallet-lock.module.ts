import { Module } from '@nestjs/common'

import { WalletLockService } from './wallet-lock.service'

@Module({
  providers: [WalletLockService],
  exports: [WalletLockService],
})
export class WalletLockModule {}
