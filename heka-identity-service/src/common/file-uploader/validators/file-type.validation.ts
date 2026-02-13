import { Injectable } from '@nestjs/common'
import { FileValidator } from '@nestjs/common/pipes/file/file-validator.interface'

import { UploadingFile } from '../dto/file'

export interface FileTypeValidationOptions {
  types: string[]
}

@Injectable()
export class FileTypeValidationPipe extends FileValidator<FileTypeValidationOptions> {
  protected readonly validationOptions: FileTypeValidationOptions

  public constructor(options: FileTypeValidationOptions) {
    const validatorOptions = options
    super(validatorOptions)
    this.validationOptions = validatorOptions
  }

  public buildErrorMessage(file: any): string {
    return `Unsupported file type: ${file.originalname}`
  }

  public isValid(file: UploadingFile) {
    const extension = file.originalname.split('.').pop()
    if (!extension) {
      return false
    }
    return this.validationOptions.types.indexOf(extension) !== -1
  }
}

@Injectable()
export class FilesTypeValidationPipe extends FileValidator<FileTypeValidationOptions> {
  protected readonly validationOptions: FileTypeValidationOptions

  public constructor(options: FileTypeValidationOptions) {
    const validatorOptions = options
    super(validatorOptions)
    this.validationOptions = validatorOptions
  }

  public buildErrorMessage(files: Record<string, Array<UploadingFile>>): string {
    const names = Object.values(files)
      .flatMap((array) => array)
      .map((file) => file.originalname)
      .join(', ')
    return `One of this files has unsupported type: ${names}`
  }

  public isValid(files: Record<string, Array<UploadingFile>>) {
    for (const o of Object.values(files)) {
      for (const file of o) {
        const extension = file.originalname.split('.').pop()
        if (!extension) {
          return false
        }
        if (this.validationOptions.types.indexOf(extension) === -1) {
          return false
        }
      }
    }
    return true
  }
}
