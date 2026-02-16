import { randomUUID } from 'crypto'
import { extname, join } from 'path'

import { ConflictException, UnprocessableEntityException } from '@nestjs/common'
import * as fs from 'fs-extra'

import { FileSystemConfig } from '../../../config/file-storage'
import { normalizeUrl } from '../../../utils/convert'
import { FileStorageDriverInterface } from '../interfaces/file-storage-driver.interface'
import { PutFileOptionsInterface } from '../interfaces/put-file.options.interface'

export class FileSystemDriver implements FileStorageDriverInterface {
  private readonly publicPath: string
  private readonly publicUrl: string

  public constructor(private readonly config: FileSystemConfig) {
    this.publicPath = this.config.path
    this.publicUrl = this.config.url
  }

  public root(): string {
    const url = this.publicUrl
    return url.endsWith('/') ? url : `${url}/`
  }

  public async get(path: string): Promise<Buffer | null> {
    try {
      const fileExists = await this.exists(path)
      if (fileExists) {
        return await fs.readFile(this.publicPath + path)
      }

      return null
    } catch (error) {
      throw new UnprocessableEntityException(error)
    }
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  public async share(path: string, expiresIn?: number): Promise<string> {
    return this.url(path)
  }

  public url(path: string): string {
    return `${this.root()}${normalizeUrl(path)}`
  }

  public async put(file: Express.Multer.File, options?: PutFileOptionsInterface): Promise<string> {
    try {
      const ext = extname(file.originalname)
      const path = options?.filePath ?? ''

      let name: string = randomUUID()
      if (options?.fileName) {
        name = options.fileName
      }

      const fileName = join(path, `${name}${ext}`)
      const filePath = join(this.publicPath, fileName)

      const fileExists = await fs.exists(filePath)
      if (fileExists && options?.replace) {
        throw new ConflictException('File already exists')
      }

      await fs.outputFile(filePath, file.buffer)

      return fileName
    } catch (error) {
      throw new UnprocessableEntityException(error)
    }
  }

  public async exists(path: string): Promise<boolean> {
    try {
      return await fs.exists(join(this.publicPath, path))
    } catch (error) {
      throw new UnprocessableEntityException(error)
    }
  }

  public async remove(path: string): Promise<boolean> {
    try {
      const fileExists = await this.exists(path)
      if (!fileExists) return false

      await fs.remove(join(this.publicPath, path))

      return true
    } catch (error) {
      throw new UnprocessableEntityException(error)
    }
  }
}
