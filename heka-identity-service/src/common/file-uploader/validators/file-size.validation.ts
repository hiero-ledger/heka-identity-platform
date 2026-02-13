import { Injectable } from '@nestjs/common'
import { FileValidator } from '@nestjs/common/pipes/file/file-validator.interface'

import { bytesToSize } from '../../../utils/convert'
import { UploadingFile } from '../dto/file'

export interface FileSizeValidationOptions {
  size: number
}

@Injectable()
export class FileSizeValidationPipe extends FileValidator {
  protected readonly validationOptions: FileSizeValidationOptions

  public constructor(options: FileSizeValidationOptions) {
    super(options)
    this.validationOptions = options
  }

  public isValid(file: UploadingFile) {
    return file.size < this.validationOptions.size
  }

  public buildErrorMessage(file: any): string {
    return `Maximum file size is ${bytesToSize(this.validationOptions.size)}`
  }
}

@Injectable()
export class FilesSizeValidationPipe extends FileValidator {
  protected readonly validationOptions: FileSizeValidationOptions

  public constructor(options: FileSizeValidationOptions) {
    super(options)
    this.validationOptions = options
  }

  public isValid(files: Record<string, Array<UploadingFile>>) {
    for (const o of Object.values(files)) {
      for (const file of o) {
        if (file.size > this.validationOptions.size) {
          return false
        }
      }
    }
    return true
  }

  public buildErrorMessage(files: Record<string, Array<UploadingFile>>): string {
    const names = Object.values(files)
      .flatMap((array) => array)
      .map((file) => file.originalname)
      .join(', ')
    return `One of this files too large (maximum size is ${bytesToSize(this.validationOptions.size)}): ${names}`
  }
}
