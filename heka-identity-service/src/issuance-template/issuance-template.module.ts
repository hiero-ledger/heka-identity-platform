import { Module } from '@nestjs/common'

import { AgentModule } from '../common/agent'
import { FileStorageModule } from '../common/file-storage/file-storage.module'

import { IssuanceTemplateController } from './issuance-template.controller'
import { IssuanceTemplateService } from './issuance-template.service'

@Module({
  imports: [AgentModule, FileStorageModule],
  controllers: [IssuanceTemplateController],
  providers: [IssuanceTemplateService],
  exports: [IssuanceTemplateService],
})
export class IssuanceTemplateModule {}
