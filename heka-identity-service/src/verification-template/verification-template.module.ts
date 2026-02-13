import { Module } from '@nestjs/common'

import { AgentModule } from '../common/agent'
import { FileStorageModule } from '../common/file-storage/file-storage.module'

import { VerificationTemplateController } from './verification-template.controller'
import { VerificationTemplateService } from './verification-template.service'

@Module({
  imports: [AgentModule, FileStorageModule],
  controllers: [VerificationTemplateController],
  providers: [VerificationTemplateService],
  exports: [VerificationTemplateService],
})
export class VerificationTemplateModule {}
