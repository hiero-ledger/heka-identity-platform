import { BaseLogger, LogLevel } from '@credo-ts/core'

import { Logger } from 'common/logger'

export class CredoLogger extends BaseLogger {
  public constructor(
    private readonly logger: Logger,
    logLevel?: LogLevel,
  ) {
    super(logLevel)
  }

  public test(message: string, data?: Record<string, any>) {
    this.logger.trace({ msg: message, data })
  }

  public trace(message: string, data?: Record<string, any>) {
    this.logger.trace({ msg: message, data })
  }

  public debug(message: string, data?: Record<string, any>) {
    this.logger.debug({ msg: message, data })
  }

  public info(message: string, data?: Record<string, any>) {
    this.logger.info({ msg: message, data })
  }

  public warn(message: string, data?: Record<string, any>) {
    this.logger.warn({ msg: message, data })
  }

  public error(message: string, data?: Record<string, any>) {
    this.logger.error({ msg: message, data })
  }

  public fatal(message: string, data?: Record<string, any>) {
    this.logger.fatal({ msg: message, data })
  }
}
