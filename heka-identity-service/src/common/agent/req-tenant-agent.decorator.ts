import { createParamDecorator, ExecutionContext } from '@nestjs/common'

export const ReqTenantAgent = createParamDecorator((data: unknown, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest()
  return request.tenantAgent
})
