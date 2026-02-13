import { IFile } from '@nestjs/common/pipes/file/interfaces'

export interface UploadingFile extends IFile {
  path: string
  filename: string
  originalname: string
  encoding: string
  destination: string
}
