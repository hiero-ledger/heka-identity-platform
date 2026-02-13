import { Module } from '@nestjs/common'

import { AgentModule } from 'common/agent'

import { AnoncredsRegistryModule } from '../common/anoncreds-registry'
import { FileStorageModule } from '../common/file-storage/file-storage.module'
import { OCAModule } from '../common/oca/oca.module'
import { RevocationModule } from '../revocation'

import { SchemaV2Controller } from './schema-v2.controller'
import { SchemaV2Service } from './schema-v2.service'

@Module({
  imports: [AgentModule, AnoncredsRegistryModule, FileStorageModule, RevocationModule, OCAModule],
  controllers: [SchemaV2Controller],
  providers: [SchemaV2Service],
  exports: [SchemaV2Service],
})
export class SchemaV2Module {}
