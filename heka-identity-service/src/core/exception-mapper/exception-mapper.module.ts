import { Module } from '@nestjs/common'

import { ExceptionMapperInterceptor } from './exception-mapper.interceptor'

@Module({
  providers: [ExceptionMapperInterceptor],
})
export class ExceptionMapperModule {}
