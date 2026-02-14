import { registerAs } from '@nestjs/config'

export enum FileStorageTarget {
  FileSystem = 'file_system',
  Minio = 'minio',
}

export const fileStorageConfigDefaults = {
  target: FileStorageTarget.FileSystem,
  fileSystem: {
    url: 'http://localhost:3000',
    path: 'files',
  },
  minio: {
    host: 'localhost',
    port: 9000,
    useSSL: true,
    accessKey: 'access_key',
    secretKey: 'secret_key',
    basketName: 'heka-identity-service',
    region: 'eu-west-1',
  },
}

const keyPrefixGlobal = 'FILE_STORAGE_'
const keyPrefixFileSystem = `${keyPrefixGlobal}FS_`
const keyPrefixMinio = `${keyPrefixGlobal}MINIO_`

const fileStorageConfigKeys = {
  target: `${keyPrefixGlobal}TARGET`,
  fileSystem: {
    url: `${keyPrefixFileSystem}URL`,
    path: `${keyPrefixFileSystem}PATH`,
  },
  minio: {
    host: `${keyPrefixMinio}HOST`,
    port: `${keyPrefixMinio}PORT`,
    useSSL: `${keyPrefixMinio}USE_SSL`,
    accessKey: `${keyPrefixMinio}ACCESS_KEY`,
    secretKey: `${keyPrefixMinio}SECRET_KEY`,
    basketName: `${keyPrefixMinio}BASKET_NAME`,
    region: `${keyPrefixMinio}REGION`,
  },
}

export class FileSystemConfig {
  public url!: string
  public path!: string

  public constructor(configuration?: Record<string, any>) {
    const env = configuration ?? process.env
    this.url = env[fileStorageConfigKeys.fileSystem.url] || fileStorageConfigDefaults.fileSystem.url
    this.path = env[fileStorageConfigKeys.fileSystem.path] || fileStorageConfigDefaults.fileSystem.path
  }
}

export class MinioConfig {
  public host!: string
  public port!: number
  public useSSL!: boolean
  public accessKey!: string
  public secretKey!: string
  public region!: string
  public basketName!: string

  public constructor(configuration?: Record<string, any>) {
    const env = configuration ?? process.env
    this.host = env[fileStorageConfigKeys.minio.host] || fileStorageConfigDefaults.minio.host
    this.port = env[fileStorageConfigKeys.minio.port]
      ? parseInt(env[fileStorageConfigKeys.minio.port])
      : fileStorageConfigDefaults.minio.port
    this.useSSL = env[fileStorageConfigKeys.minio.useSSL] === 'true'
    this.accessKey = env[fileStorageConfigKeys.minio.accessKey] || fileStorageConfigDefaults.minio.accessKey
    this.secretKey = env[fileStorageConfigKeys.minio.secretKey] || fileStorageConfigDefaults.minio.secretKey
    this.basketName = env[fileStorageConfigKeys.minio.basketName] || fileStorageConfigDefaults.minio.basketName
    this.region = env[fileStorageConfigKeys.minio.region] || fileStorageConfigDefaults.minio.region
  }
}

export class FileStorageConfig {
  public target: FileStorageTarget
  public fileSystemConfig?: FileSystemConfig
  public minioConfig?: MinioConfig

  public constructor(configuration?: Record<string, any>) {
    const env = configuration ?? process.env

    this.target = env[fileStorageConfigKeys.target] || fileStorageConfigDefaults.target

    switch (this.target) {
      case FileStorageTarget.Minio:
        this.minioConfig = new MinioConfig(configuration)
        break
      default:
        this.fileSystemConfig = new FileSystemConfig(configuration)
        break
    }
  }
}

export default registerAs('file-storage', () => {
  const fileStorageConfig = new FileStorageConfig()
  return {
    target: fileStorageConfig.target,
    fileSystemConfig: fileStorageConfig.fileSystemConfig,
    minioConfig: fileStorageConfig.minioConfig,
  }
})
