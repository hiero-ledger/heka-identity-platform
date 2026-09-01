import { ConfigModule } from '@config'
import { OidcSigningKey } from '@core/database'
import { MikroOrmModule } from '@mikro-orm/nestjs'
import { Module } from '@nestjs/common'

import { SigningKeysService } from './signing-keys.service'

/** OP core module (INTEGRATION.md §4.1) — Phase 0 hosts the signing-key store; Phase 1 adds the provider itself. */
@Module({
  imports: [ConfigModule, MikroOrmModule.forFeature({ entities: [OidcSigningKey] })],
  providers: [SigningKeysService],
  exports: [SigningKeysService],
})
export class OidcModule {}
