import { Inject, Injectable } from '@nestjs/common'
import { ConfigType } from '@nestjs/config'

import FileStorage, { FileStorageTarget } from '../../config/file-storage'

import { FileSystemDriver } from './drivers/file-system.driver'
import { MinioDriver } from './drivers/minio.driver'
import { FileStorageDriverInterface } from './interfaces/file-storage-driver.interface'
import { PutFileOptionsInterface } from './interfaces/put-file.options.interface'

@Injectable()
export class FileStorageService implements FileStorageDriverInterface {
  private readonly driver: FileStorageDriverInterface

  public constructor(
    @Inject(FileStorage.KEY)
    private readonly config: ConfigType<typeof FileStorage>,
  ) {
    switch (this.config.target) {
      case FileStorageTarget.Minio:
        this.driver = new MinioDriver(this.config.minioConfig!)
        break
      default:
        this.driver = new FileSystemDriver(this.config.fileSystemConfig!)
    }
  }

  public root = () => this.driver.root()

  public get = async (path: string): Promise<Buffer | null> => this.driver.get(path)

  public share = (path: string, expiesIn?: number): Promise<string> => this.driver.share(path, expiesIn)

  public url = (path: string): string => this.driver.url(path)

  public put = async (file: Express.Multer.File, options?: PutFileOptionsInterface): Promise<string> =>
    this.driver.put(file, options)

  public exists = async (path: string): Promise<boolean> => this.driver.exists(path)

  public remove = async (path: string): Promise<boolean> => this.driver.remove(path)
}
