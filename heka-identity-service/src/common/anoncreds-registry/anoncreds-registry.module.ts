import { Module } from '@nestjs/common'

import { AgentModule } from '../agent'

import { AnoncredsRegistryService } from './anoncreds-registry.service'

@Module({
  imports: [AgentModule],
  providers: [AnoncredsRegistryService],
  exports: [AnoncredsRegistryService],
})
export class AnoncredsRegistryModule {}
