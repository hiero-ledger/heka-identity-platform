import { Module } from '@nestjs/common'

import { AgentModule } from 'common/agent'

import { AnoncredsRegistryModule } from '../common/anoncreds-registry'
import { RevocationModule } from '../revocation'

import { CredentialController } from './credential.controller'
import { CredentialService } from './credential.service'

@Module({
  imports: [AgentModule, AnoncredsRegistryModule, RevocationModule],
  controllers: [CredentialController],
  providers: [CredentialService],
  exports: [CredentialService],
})
export class CredentialModule {}
