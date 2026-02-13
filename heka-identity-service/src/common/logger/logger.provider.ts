import { Inject, Injectable } from '@nestjs/common'
import { Logger as NestLogger, Params, PARAMS_PROVIDER_TOKEN, PinoLogger } from 'nestjs-pino'
import { pino } from 'pino'

import { undefinedToNull } from 'utils/object'

type LoggerFn = ((msg: string, ...args: any[]) => void) | ((obj: object, msg?: string, ...args: any[]) => void)

export class Logger extends PinoLogger {
  protected bindings?: pino.Bindings

  public constructor(private readonly params: Params) {
    super(params)
  }

  public traceObject(obj: object) {
    undefinedToNull(obj)
    const keys = Object.keys(obj).join(', ')
    this.trace(obj, `? ${keys}`)
  }

  public trace(msg: string, ...args: any[]): void
  public trace(obj: unknown, msg?: string, ...args: any[]): void
  public trace(...args: Parameters<LoggerFn>) {
    this.call('trace', ...args)
  }

  public debug(msg: string, ...args: any[]): void
  public debug(obj: unknown, msg?: string, ...args: any[]): void
  public debug(...args: Parameters<LoggerFn>) {
    this.call('debug', ...args)
  }

  public info(msg: string, ...args: any[]): void
  public info(obj: unknown, msg?: string, ...args: any[]): void
  public info(...args: Parameters<LoggerFn>) {
    this.call('info', ...args)
  }

  public warn(msg: string, ...args: any[]): void
  public warn(obj: unknown, msg?: string, ...args: any[]): void
  public warn(...args: Parameters<LoggerFn>) {
    this.call('warn', ...args)
  }

  public error(msg: string, ...args: any[]): void
  public error(obj: unknown, msg?: string, ...args: any[]): void
  public error(...args: Parameters<LoggerFn>) {
    this.call('error', ...args)
  }

  public fatal(msg: string, ...args: any[]): void
  public fatal(obj: unknown, msg?: string, ...args: any[]): void
  public fatal(...args: Parameters<LoggerFn>) {
    this.call('fatal', ...args)
  }

  protected setBindings(bindings?: pino.Bindings) {
    this.bindings = bindings
  }

  protected call(method: pino.Level, ...args: Parameters<LoggerFn>) {
    if (this.bindings) {
      if (isFirstArgObject(args)) {
        const firstArg = args[0]
        if (firstArg instanceof Error) {
          args = [Object.assign(this.bindings, { err: firstArg }), ...args.slice(1)]
        } else {
          args = [Object.assign(this.bindings, firstArg), ...args.slice(1)]
        }
      } else {
        args = [this.bindings, ...args]
      }
    }
    super.call(method, ...args)
  }

  public child(context: string, bindings?: pino.Bindings): Logger {
    const childContext = this.context ? `${this.context}.${context}` : context

    const childLogger = new Logger(this.params)
    childLogger.setContext(childContext)
    childLogger.setBindings(bindings)

    return childLogger
  }
}

function isFirstArgObject(args: Parameters<LoggerFn>): args is [obj: object, msg?: string, ...args: any[]] {
  return typeof args[0] === 'object'
}

@Injectable()
export class LoggerProvider {
  private readonly logger: Logger

  public constructor(@Inject(PARAMS_PROVIDER_TOKEN) params: Params) {
    this.logger = new Logger(params)
  }

  public getLogger(): Logger {
    return this.logger
  }

  public getNestLogger(): NestLogger {
    return new NestLogger(this.logger, {})
  }
}
