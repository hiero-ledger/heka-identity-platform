import { PutFileOptionsInterface } from './put-file.options.interface'

export interface FileStorageDriverInterface {
  /**
   * Construct a public root URL for the file located.
   */
  root(): string

  /**
   * Retrieves the content of a file from the specified path and returns it as a Buffer.
   * @param path - The path of the file to retrieve.
   */
  get(path: string): Promise<Buffer | null>

  /**
   * Generates a shared URL for the file located at the specified path.
   * For local system will be equals to Url and the param expiresIn won't be used
   * @param path - The file path to generate the URL for.
   * @param expiresIn - The duration in seconds for which the signed URL will be valid (default 15 minutes)
   */
  share(path: string, expiresIn?: number): Promise<string>

  /**
   * Construct a public URL for the file located at the specified path.
   * Applicable only for AWS S3, for local system will be equals to publicUrl.
   * @param path - The file path to generate the URL for.
   */
  url(path: string): string

  /**
   * Uploads a file to the system with optional options and returns the file URL.
   * @param file - The file object to be uploaded.
   * @param options - Additional options for the file upload (optional).
   */
  put(file: Express.Multer.File, options?: PutFileOptionsInterface): Promise<string>

  /**
   * Checks if a file exists at the specified path.
   * @param path - The path of the file to check for existence.
   */
  exists(path: string): Promise<boolean>

  /**
   * Deletes the file at the specified path and returns true if successful.
   * @param path - The path of the file to delete.
   */
  remove(path: string): Promise<boolean>
}
