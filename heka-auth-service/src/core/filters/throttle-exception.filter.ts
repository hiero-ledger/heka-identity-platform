import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from '@nestjs/common'
import { ThrottlerException } from '@nestjs/throttler'
import { Response } from 'express'

@Catch(ThrottlerException)
export class ThrottleExceptionFilter implements ExceptionFilter {
  catch(_exception: ThrottlerException, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>()
    response.status(HttpStatus.TOO_MANY_REQUESTS).json({
      statusCode: 429,
      error: 'Too Many Requests',
      message: 'Rate limit exceeded. Please wait before retrying.',
    })
  }
}
