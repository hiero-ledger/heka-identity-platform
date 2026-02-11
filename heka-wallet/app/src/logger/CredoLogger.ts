import { BaseLogger, LogLevel } from '@credo-ts/core'
import { GlobalLogger, Logger } from '@heka-wallet/shared'

export class CredoLogger extends BaseLogger {
  private internalLogger: Logger

  public constructor(context: string) {
    super(LogLevel.trace)
    this.internalLogger = GlobalLogger.createContextLogger(context)
  }

  public debug(message: string, data?: Record<string, any>): void {
    const logArgs = data ? [message, data] : message
    this.internalLogger.debug(logArgs)
  }

  public error(message: string, data?: Record<string, any>): void {
    const logArgs = data ? [message, data] : message
    this.internalLogger.error(logArgs)
  }

  public fatal(message: string, data?: Record<string, any>): void {
    this.error(message, data)
  }

  public info(message: string, data?: Record<string, any>): void {
    const logArgs = data ? [message, data] : message
    this.internalLogger.info(logArgs)
  }

  public test(message: string, data?: Record<string, any>): void {
    this.debug(message, data)
  }

  public trace(message: string, data?: Record<string, any>): void {
    const logArgs = data ? [message, data] : message
    this.internalLogger.trace(logArgs)
  }

  public warn(message: string, data?: Record<string, any>): void {
    const logArgs = data ? [message, data] : message
    this.internalLogger.warn(logArgs)
  }
}
