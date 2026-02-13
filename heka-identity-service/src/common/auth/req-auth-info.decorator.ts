import { createParamDecorator, ExecutionContext } from '@nestjs/common'

export const ReqAuthInfo = createParamDecorator((data: unknown, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest()
  return request.user
})
