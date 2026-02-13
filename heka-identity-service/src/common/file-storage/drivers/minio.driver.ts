import { randomUUID } from 'crypto'
import { extname } from 'path'

import { ConflictException, UnprocessableEntityException } from '@nestjs/common'
import * as Minio from 'minio'

import { MinioConfig } from '../../../config/file-storage'
import { normalizeUrl } from '../../../utils/convert'
import { FileStorageDriverInterface } from '../interfaces/file-storage-driver.interface'
import { PutFileOptionsInterface } from '../interfaces/put-file.options.interface'

export class MinioDriver implements FileStorageDriverInterface {
  private minioClient: Minio.Client

  private EXPIRES_IN_DEFAULT = 15 * 60 // 15 min

  public constructor(private readonly config: MinioConfig) {
    this.minioClient = new Minio.Client({
      endPoint: this.config.host,
      port: this.config.port,
      useSSL: this.config.useSSL,
      accessKey: this.config.accessKey,
      secretKey: this.config.secretKey,
    })
    void (async () => {
      await this.createBucketIfNotExists()
    })()
  }

  private createBucketIfNotExists = async () => {
    const bucketExists = await this.minioClient.bucketExists(this.config.basketName)
    if (!bucketExists) {
      // make bucket
      await this.minioClient.makeBucket(this.config.basketName, this.config.region)

      // set bucket policy
      const publicReadPolicy = {
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Principal: '*',
            Action: 's3:GetObject',
            Resource: `arn:aws:s3:::${this.config.basketName}/*`,
          },
        ],
      }
      await this.minioClient.setBucketPolicy(this.config.basketName, JSON.stringify(publicReadPolicy))
    }
  }

  public root(): string {
    const url = new URL(
      this.config.basketName,
      `${this.config.useSSL ? 'https' : 'http'}://${this.config.host}:${this.config.port}`,
    ).href
    return url.endsWith('/') ? url : `${url}/`
  }

  public async get(path: string): Promise<Buffer | null> {
    try {
      const fileExists = await this.exists(path)
      if (fileExists) {
        const response = await this.minioClient.getObject(this.config.basketName, path)
        const stream = response

        return new Promise((resolve, reject) => {
          const chunks: Buffer[] = []
          stream.on('data', (chunk) => chunks.push(chunk))
          stream.once('end', () => resolve(Buffer.concat(chunks)))
          stream.once('error', () => reject)
        })
      }
      return null
    } catch (error) {
      throw new UnprocessableEntityException(error)
    }
  }

  public async share(path: string, expiresIn?: number): Promise<string> {
    return await this.minioClient.presignedUrl(
      'GET',
      this.config.basketName,
      path,
      expiresIn ?? this.EXPIRES_IN_DEFAULT,
    )
  }

  public url(path: string): string {
    return `${this.root()}${normalizeUrl(path)}`
  }

  public async put(file: Express.Multer.File, options?: PutFileOptionsInterface): Promise<string> {
    try {
      const ext = extname(file.originalname)
      const path = options?.filePath || ''
      let name: string = randomUUID()
      if (options?.fileName) {
        name = options.fileName
      }

      const fileName = `${name}${ext}`
      const filePath = `${path}/${fileName}`
      const fileExists = await this.exists(filePath)

      if (fileExists && !options?.replace) {
        throw new ConflictException('File already exists')
      }

      await this.minioClient.putObject(this.config.basketName, filePath, file.buffer, file.size)

      return filePath
    } catch (error) {
      throw new UnprocessableEntityException(error)
    }
  }

  public async exists(path: string): Promise<boolean> {
    return !!(await this.minioClient.findUploadId(this.config.basketName, path))
  }

  public async remove(path: string): Promise<boolean> {
    try {
      await this.minioClient.removeObject(this.config.basketName, path)
      return true
    } catch (ex) {
      return false
    }
  }
}
