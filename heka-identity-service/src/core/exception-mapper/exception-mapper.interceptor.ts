import { CredoError, RecordNotFoundError } from '@credo-ts/core'
import {
  CallHandler,
  ExecutionContext,
  Injectable,
  InternalServerErrorException,
  NestInterceptor,
  NotFoundException,
} from '@nestjs/common'
import { Observable, throwError } from 'rxjs'
import { catchError } from 'rxjs/operators'

import { InjectLogger, Logger } from 'common/logger'

@Injectable()
export class ExceptionMapperInterceptor implements NestInterceptor {
  public constructor(
    @InjectLogger(ExceptionMapperInterceptor)
    private readonly logger: Logger,
  ) {}

  public intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      catchError((err) => {
        // Usually a lookup by an id the client sent (an issuer, a session, a connection): a client error. Not so a
        // missing tenant, which every authenticated request resolves first: that is a wallet inconsistency, a 500
        const recordType = err instanceof RecordNotFoundError ? recordTypeOf(err) : undefined
        if (err instanceof RecordNotFoundError && recordType !== 'TenantRecord') {
          const request = context
            .switchToHttp()
            .getRequest<{ method?: string; route?: { path?: string } } | undefined>()
          this.logger
            .child('intercept')
            .warn(`${recordType ?? 'Record'} not found: ${request?.method ?? ''} ${request?.route?.path ?? ''}`.trim())
          // Credo's message can include the record query, which is not the client's business
          return throwError(() => new NotFoundException(`${recordType ?? 'Record'} not found`))
        }
        if (err instanceof CredoError) {
          const logger = this.logger.child('intercept')
          logger.error(err)
          return throwError(() => new InternalServerErrorException(err.message))
        }
        return throwError(() => err)
      }),
    )
  }
}

/** Credo's `RecordNotFoundError` has no field for the record type; its constructor prefixes the message with it. */
function recordTypeOf(error: RecordNotFoundError): string | undefined {
  return /^(\w+): /.exec(error.message)?.[1]
}
