import * as fs from 'fs'
import * as path from 'path'

export const getPackageVersion = (): string => {
  const packageJsonPath = path.join(process.cwd(), 'package.json')
  return JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')).version
}

export const isVersionPath = (path: string, version?: string): boolean => {
  const versionPart = version ? `\\/v${version.replace('.', '\\.')}` : '\\/v\\d+(?:\\.\\d+)*'
  const regex = new RegExp(
    `^${versionPart}(?:-[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?(?:\\+[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?(\\/.*)?$`,
  )
  return regex.test(path)
}

export const isNonVersionPath = (path: string): boolean => {
  const NON_VERSION_PATH_REGEX =
    /^(?!\/v\d+(?:\.\d+)*(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(\/.*)?$).*/
  return NON_VERSION_PATH_REGEX.test(path)
}
