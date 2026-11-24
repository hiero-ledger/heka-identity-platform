import { CredoError } from '@credo-ts/core'
import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus, Logger } from '@nestjs/common'
import { Response } from 'express'

@Catch(CredoError)
export class CredoExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(CredoExceptionFilter.name)

  public catch(exception: CredoError, host: ArgumentsHost) {
    const ctx = host.switchToHttp()
    const response = ctx.getResponse<Response>()
    const request = ctx.getRequest<Request>()

    // Log real error internally — never expose to client
    this.logger.error(`CredoError: ${exception.message}`)

    // Send safe generic message to client
    const message = 'An internal identity service error occurred'
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
