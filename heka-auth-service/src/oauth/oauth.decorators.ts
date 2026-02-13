import { createParamDecorator, ExecutionContext } from '@nestjs/common'

export const AccessToken = createParamDecorator((data: unknown, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest()
  return request.accessToken
})

export const Sender = createParamDecorator((data: unknown, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest()
  return request.sender
})
