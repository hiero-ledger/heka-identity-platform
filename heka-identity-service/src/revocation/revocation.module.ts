import { Module } from '@nestjs/common'

import { AgentModule } from '../common/agent'
import { AnoncredsRegistryModule } from '../common/anoncreds-registry'

import { RevocationRegistryController } from './revocation-registry/revocation-registry.controller'
import { RevocationRegistryService } from './revocation-registry/revocation-registry.service'
import { TailsController } from './revocation-registry/tails.controller'
import { TailsService } from './revocation-registry/tails.service'
import { StatusListController } from './status-list/status-list.controller'
import { StatusListPublicController } from './status-list/status-list.public.controller'
import { StatusListService } from './status-list/status-list.service'
import { TokenStatusListPublicController } from './token-status-list/token-status-list.public.controller'
import { TokenStatusListService } from './token-status-list/token-status-list.service'

@Module({
  imports: [AgentModule, AnoncredsRegistryModule],
  controllers: [
    RevocationRegistryController,
    TailsController,
    StatusListController,
    StatusListPublicController,
    TokenStatusListPublicController,
  ],
  providers: [RevocationRegistryService, TailsService, StatusListService, TokenStatusListService],
  exports: [RevocationRegistryService, StatusListService, TokenStatusListService],
})
export class RevocationModule {}
