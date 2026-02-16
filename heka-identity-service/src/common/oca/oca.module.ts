import { Module } from '@nestjs/common'

import { FileStorageModule } from '../file-storage/file-storage.module'

import { OCAListener } from './listener/oca-listener.service'
import { OCAFilesService } from './oca.files.service'
import { OCAService } from './oca.service'

@Module({
  imports: [FileStorageModule],
  providers: [OCAService, OCAListener, OCAFilesService],
  exports: [OCAService, OCAFilesService],
})
export class OCAModule {}
