import _ from 'lodash'
import { getManufacturerSync, getModel, getSystemName, getSystemVersion, getVersion } from 'react-native-device-info'
import RNFS, { copyFile, DocumentDirectoryPath, mkdir, stat, unlink } from 'react-native-fs'
import { consoleTransport, fileAsyncTransport, logger } from 'react-native-logs'
import Share from 'react-native-share'
import { zip } from 'react-native-zip-archive'

const LOG_SIZE_IN_MB = 1
const LOG_ZIP_FOLDER_NAME = 'logArchive'
const TRANSPORT_LOG_FILE_NAME = 'log.txt'

export enum LogLevel {
  trace,
  debug,
  info,
  warn,
  error,
}

interface MyLogContext {
  context?: string
  logId: string
}

const loggerInstance = logger.createLogger({
  severity: LogLevel[LogLevel.debug],
  transport: (props) => {
    consoleTransport(props)
    fileAsyncTransport(props)
    return true
  },
  transportOptions: {
    FS: RNFS,
    fileName: TRANSPORT_LOG_FILE_NAME,
    filePath: DocumentDirectoryPath,
    colors: {
      [LogLevel[LogLevel.trace]]: 'grey',
      [LogLevel[LogLevel.debug]]: 'white',
      [LogLevel[LogLevel.info]]: 'blue',
      [LogLevel[LogLevel.warn]]: 'yellow',
      [LogLevel[LogLevel.error]]: 'red',
    },
  },
  levels: {
    [LogLevel[LogLevel.trace]]: LogLevel.trace,
    [LogLevel[LogLevel.debug]]: LogLevel.debug,
    [LogLevel[LogLevel.info]]: LogLevel.info,
    [LogLevel[LogLevel.warn]]: LogLevel.warn,
    [LogLevel[LogLevel.error]]: LogLevel.error,
  },
  async: false,
  dateFormat: 'iso',
  printLevel: true,
  printDate: true,
  enabled: true,
})

export class Logger {
  public constructor(
    private readonly log: any,
    public readonly ignoreList: Map<string, Set<string> | 'ignoreAll'> = new Map()
  ) {}

  public ignoreContext<TContext extends { context: string }, UProperty extends keyof Omit<TContext, 'context'>>(
    contextObject: TContext,
    props?: ReadonlyArray<UProperty>
  ): void {
    if (!props) {
      // Empty props – ignore full context
      this.ignoreList.set(contextObject.context, 'ignoreAll')
      return
    }

    const pickUserIgnoredKeys = _.pick(contextObject, ...props)
    const keyValues = new Set(Object.values(pickUserIgnoredKeys) as string[])
    this.ignoreList.set(contextObject.context, keyValues)
  }

  public ignoreContextByName(contextName: string) {
    this.ignoreList.set(contextName, 'ignoreAll')
  }

  public createContextLogger(contextName: string): Logger {
    const extendedLogger = this.log.extend(contextName)
    this.log.enable(contextName)
    return new Logger(extendedLogger, this.ignoreList)
  }

  public set severity(level: LogLevel) {
    this.log.setSeverity(LogLevel[level])
  }

  public get severity(): LogLevel {
    const levelStr: string = this.log.getSeverity()
    const level = LogLevel[levelStr as keyof typeof LogLevel]
    return level
  }

  private logWithLevel(level: LogLevel, ...logRecordParts: any[]) {
    const logData = logRecordParts.find((x) => x != null && typeof x === 'object' && 'context' in x) as MyLogContext

    if (logData?.context) {
      const ignoredLogs = this.ignoreList.get(logData.context)
      if (ignoredLogs && (ignoredLogs === 'ignoreAll' || ignoredLogs.has(logData.logId))) {
        return
      }

      // Remove context because it does not make sense to show it in log data in console
      // It is displayed in the context part or log message
      logData.context = undefined
    }

    switch (level) {
      case LogLevel.trace:
        this.log.trace(...logRecordParts)
        break
      case LogLevel.info:
        this.log.info(...logRecordParts)
        break
      case LogLevel.warn:
        this.log.warn(...logRecordParts)
        break
      case LogLevel.error:
        this.log.error(...logRecordParts)
        break
      case LogLevel.debug:
        this.log.debug(...logRecordParts)
    }
  }

  public trace(...msgs: any[]) {
    this.logWithLevel(LogLevel.trace, ...msgs)
  }

  public debug(...msgs: any[]) {
    this.logWithLevel(LogLevel.debug, ...msgs)
  }

  public info(...msgs: any[]) {
    this.logWithLevel(LogLevel.info, ...msgs)
  }

  public warn(...msgs: any[]) {
    this.logWithLevel(LogLevel.warn, ...msgs)
  }

  public error(...msgs: any[]) {
    this.logWithLevel(LogLevel.error, ...msgs)
  }
}

export const GlobalLogger = new Logger(loggerInstance)

export async function exportLogs() {
  const info = {
    appVersion: getVersion(),
    systemName: getSystemName(),
    manufacturer: getManufacturerSync(),
    model: getModel(),
    osVersion: getSystemVersion(),
  }

  GlobalLogger.warn('Exporting log file', { debugInfo: info })

  const filePath = `${DocumentDirectoryPath}/${TRANSPORT_LOG_FILE_NAME}`
  const timestamp = new Date().toISOString()
  const exportedFileNameWithoutExtension = `log-heka-wallet-${info.appVersion}-${info.systemName}-${info.osVersion}-${
    info.manufacturer
  }-${info.model}-${timestamp.replace(/:/g, '')}`

  let resultPath = ''

  const logStat = await stat(filePath)
  if (logStat.size > 1024 * 1024 * LOG_SIZE_IN_MB) {
    const zipFolderPath = `${DocumentDirectoryPath}/${LOG_ZIP_FOLDER_NAME}`
    await mkdir(zipFolderPath)
    await copyFile(filePath, `${zipFolderPath}/${exportedFileNameWithoutExtension}.txt`)
    resultPath = await zip(zipFolderPath, `${DocumentDirectoryPath}/${exportedFileNameWithoutExtension}.zip`)
    await unlink(zipFolderPath)
  } else {
    const txtFolderPath = `${DocumentDirectoryPath}/${exportedFileNameWithoutExtension}.txt`
    await copyFile(filePath, txtFolderPath)
    resultPath = txtFolderPath
  }

  GlobalLogger.info('Exported log file name', { exportedFileNameWithoutExtension })
  return Share.open({ url: `file://${resultPath}` })
}
