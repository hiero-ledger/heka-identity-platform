import { BaseLogger, LogLevel } from '@credo-ts/core'

import { Logger } from 'common/logger'

type SerializedError = { name: string; message: string; stack?: string; cause?: unknown }

function serializeError(error: Error, seen = new Set<Error>()): SerializedError {
  seen.add(error)
  const cause = (error as Error & { cause?: unknown }).cause
  return {
    name: error.name,
    message: error.message,
    stack: error.stack,
    cause: cause instanceof Error ? (seen.has(cause) ? '[Circular cause]' : serializeError(cause, seen)) : cause,
  }
}

/**
 * Credo passes errors inside `data` (e.g. `{ error }`); pino serializes an Error only at its top-level `err`
 * key, so a nested one is logged as `{}` and the reason is lost.
 */
export function serializeLogData(data?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!data) return data
  return Object.fromEntries(
    Object.entries(data).map(([key, value]) => [key, value instanceof Error ? serializeError(value) : value]),
  )
}

export class CredoLogger extends BaseLogger {
  public constructor(
    private readonly logger: Logger,
    logLevel?: LogLevel,
  ) {
    super(logLevel)
  }

  public test(message: string, data?: Record<string, any>) {
    this.logger.trace({ msg: message, data: serializeLogData(data) })
  }

  public trace(message: string, data?: Record<string, any>) {
    this.logger.trace({ msg: message, data: serializeLogData(data) })
  }

  public debug(message: string, data?: Record<string, any>) {
    this.logger.debug({ msg: message, data: serializeLogData(data) })
  }

  public info(message: string, data?: Record<string, any>) {
    this.logger.info({ msg: message, data: serializeLogData(data) })
  }

  public warn(message: string, data?: Record<string, any>) {
    this.logger.warn({ msg: message, data: serializeLogData(data) })
  }

  public error(message: string, data?: Record<string, any>) {
    this.logger.error({ msg: message, data: serializeLogData(data) })
  }

  public fatal(message: string, data?: Record<string, any>) {
    this.logger.fatal({ msg: message, data: serializeLogData(data) })
  }
}
