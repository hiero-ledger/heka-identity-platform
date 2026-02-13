import { CredoError } from '@credo-ts/core'
import {
  CallHandler,
  ExecutionContext,
  Injectable,
  InternalServerErrorException,
  NestInterceptor,
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
