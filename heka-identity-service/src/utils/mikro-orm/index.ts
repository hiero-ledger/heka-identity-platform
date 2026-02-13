import { Dictionary, IPrimaryKey, QueryOrder, QueryOrderNumeric } from '@mikro-orm/core'
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  InternalServerErrorException,
  NotFoundException,
  Type,
} from '@nestjs/common'

import { Logger } from 'common/logger'

export type Ordering = QueryOrder | QueryOrderNumeric | keyof typeof QueryOrder

export const Like = (q: string) => new RegExp(`^.*${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}.*$`)

export const OrderBy = <T>(keys: (keyof T)[], order: Ordering) =>
  keys
    .map((key) => ({
      [key]: order,
    }))
    .reduce((acc, item) => ({ ...acc, ...item }), {})

export type HandlerFn = (entityName: string, where: Dictionary | IPrimaryKey | any) => Error

export interface FailHandlerOptions {
  message: (entityName: string) => string
  logLevel: keyof Pick<Logger, 'trace' | 'debug' | 'info' | 'warn' | 'error'>
  exception: Type<HttpException>
  logMsg?: string
}

export function failHandler(logger: Logger, options: FailHandlerOptions) {
  return (entityName: string, where: Dictionary | IPrimaryKey | any): Error => {
    const err = new options.exception(options.message(entityName))
    logger[options.logLevel]({ err, entityName, where }, `! ${options.logMsg || 'not found'}`)
    return err
  }
}

export function badRequestHandler(logger: Logger, options?: Partial<FailHandlerOptions>): HandlerFn {
  return failHandler(logger, {
    exception: BadRequestException,
    message: (entityName) => `${entityName} not found!`,
    logLevel: 'info',
    ...options,
  })
}

export function notFoundHandler(logger: Logger, options?: Partial<FailHandlerOptions>): HandlerFn {
  return failHandler(logger, {
    exception: NotFoundException,
    message: (entityName) => `${entityName} not found!`,
    logLevel: 'info',
    ...options,
  })
}

export function accessDeniedHandler(logger: Logger, options?: Partial<FailHandlerOptions>): HandlerFn {
  return failHandler(logger, {
    exception: ForbiddenException,
    message: (entityName) => `${entityName} access denied!`,
    logLevel: 'warn',
    ...options,
  })
}

export function internalServerErrorHandler(logger: Logger, options?: Partial<FailHandlerOptions>): HandlerFn {
  return failHandler(logger, {
    exception: InternalServerErrorException,
    message: (entityName) => `${entityName} doesn't exists!`,
    logLevel: 'error',
    ...options,
  })
}

export function conflictHandler(logger: Logger, options?: Partial<FailHandlerOptions>): HandlerFn {
  return failHandler(logger, {
    exception: ConflictException,
    message: (entityName) => `${entityName} already exists!`,
    logLevel: 'info',
    logMsg: 'already exists',
    ...options,
  })
}
