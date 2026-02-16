import { ParseFilePipeBuilder } from '@nestjs/common'
import { ParseFilePipe } from '@nestjs/common/pipes/file/parse-file.pipe'

import { maxImageSize, supportedImageTypes } from './const/image.validation.const'
import { FileSizeValidationPipe, FilesSizeValidationPipe } from './validators/file-size.validation'
import { FilesTypeValidationPipe, FileTypeValidationPipe } from './validators/file-type.validation'

export const ImageUploadingValidationPipe = (required?: boolean): ParseFilePipe => {
  return new ParseFilePipeBuilder()
    .addValidator(
      new FileTypeValidationPipe({
        types: supportedImageTypes,
      }),
    )
    .addValidator(
      new FileSizeValidationPipe({
        size: maxImageSize,
      }),
    )
    .build({
      fileIsRequired: required ?? false,
    })
}

export const ImagesUploadingValidationPipe = (required?: boolean): ParseFilePipe => {
  return new ParseFilePipeBuilder()
    .addValidator(
      new FilesTypeValidationPipe({
        types: supportedImageTypes,
      }),
    )
    .addValidator(
      new FilesSizeValidationPipe({
        size: maxImageSize,
      }),
    )
    .build({
      fileIsRequired: required ?? false,
    })
}
