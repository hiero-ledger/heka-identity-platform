import { Module } from '@nestjs/common'

import { AgentModule } from 'common/agent'

import { AnoncredsRegistryModule } from '../common/anoncreds-registry'

import { SchemaController } from './schema.controller'
import { SchemaService } from './schema.service'

@Module({
  imports: [AgentModule, AnoncredsRegistryModule],
  controllers: [SchemaController],
  providers: [SchemaService],
})
export class SchemaModule {}
