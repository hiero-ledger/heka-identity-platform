import { FileStorageConfig, FileStorageTarget } from 'src/config/file-storage'

export default () => {
  // Pin the file-storage driver to the file system with a localhost base URL.
  // Without this override, a developer-machine `.env` (loaded automatically by
  // NestJS ConfigModule) can leak `FILE_STORAGE_FS_PUBLIC_URL` (typically an
  // ngrok tunnel) into the test process. OID4VCI issuer metadata embeds
  // `publicUrl(...)` for credential logos while REST responses expose
  // `url(...)`, and the e2e tests compare the two — so both must resolve
  // against the same base.
  const port = process.env.EXPRESS_PORT || 3000
  const url = `http://localhost:${port}`

  const config = new FileStorageConfig({
    FILE_STORAGE_TARGET: FileStorageTarget.FileSystem,
    FILE_STORAGE_FS_URL: url,
    FILE_STORAGE_FS_PUBLIC_URL: url,
    FILE_STORAGE_FS_PATH: process.env.FILE_STORAGE_FS_PATH,
  })

  return {
    target: config.target,
    fileSystemConfig: config.fileSystemConfig,
    minioConfig: config.minioConfig,
  }
}
