import { Module } from '@nestjs/common'

import { AgentModule } from 'common/agent'

import { AnoncredsRegistryModule } from '../common/anoncreds-registry'

import { CredentialDefinitionController } from './credential-definition.controller'
import { CredentialDefinitionService } from './credential-definition.service'

@Module({
  imports: [AgentModule, AnoncredsRegistryModule],
  controllers: [CredentialDefinitionController],
  providers: [CredentialDefinitionService],
})
export class CredentialDefinitionModule {}
