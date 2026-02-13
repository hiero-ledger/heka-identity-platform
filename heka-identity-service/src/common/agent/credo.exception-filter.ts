import { CredoError } from '@credo-ts/core'
import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from '@nestjs/common'
import { Response } from 'express'

@Catch(CredoError)
export class CredoExceptionFilter implements ExceptionFilter {
  public catch(exception: CredoError, host: ArgumentsHost) {
    const ctx = host.switchToHttp()
    const response = ctx.getResponse<Response>()
    const request = ctx.getRequest<Request>()
    const message = exception.message
    const status = CredoExceptionFilter.getErrorHttpStatus(exception.name)
    response.status(status).json({
      status,
      message,
      timestamp: new Date().toISOString(),
      path: request.url,
    })
  }

  private static getErrorHttpStatus(name: string): HttpStatus {
    switch (name) {
      default:
        return HttpStatus.INTERNAL_SERVER_ERROR
    }
  }
}
