import { MulterModuleOptions } from '@nestjs/platform-express'
import { memoryStorage } from 'multer'

import { maxMulterRequestSize } from './const/image.validation.const'

export const imageMulterOptions: MulterModuleOptions = {
  storage: memoryStorage(),
  limits: {
    fileSize: maxMulterRequestSize,
  },
}
