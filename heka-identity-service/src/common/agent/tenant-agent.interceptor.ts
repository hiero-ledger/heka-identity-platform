import { CallHandler, ExecutionContext, Inject, Injectable, NestInterceptor } from '@nestjs/common'
import { dematerialize, materialize, mergeMap, Observable, of } from 'rxjs'

import { AuthInfo } from 'common/auth'

import { Agent, AGENT_TOKEN } from './agent.provider'

@Injectable()
export class TenantAgentInterceptor implements NestInterceptor {
  public constructor(
    @Inject(AGENT_TOKEN)
    private readonly agent: Agent,
  ) {}

  public async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<any>> {
    const request = context.switchToHttp().getRequest()
    const user = request.user as AuthInfo

    const tenantAgent = await this.agent.modules.tenants.getTenantAgent({
      tenantId: user.tenantId,
    })

    request.tenantAgent = tenantAgent

    return next.handle().pipe(
      // We have to end `tenantAgent` session finally. We would do this in `finalize` operator
      // but its argument function returns `void` and thus provides no way to await a promise within it,
      // while we have to await `TenantAgent.endSession` result promise.
      // To perform asynchronous operations within a pipe chain we can facilitate `mergeMap` operator.
      // Its argument function maps each source value into a new `Observable` and `mergeMap` then flatten
      // the values from all these created `Observable`s into the output `Observable`.
      // More precisely, the return type of `mergeMap`'s argument function is `ObservableInput`
      // which is wider than `Observable` and any `Promise` is also an `ObservableInput`.
      // However, `mergeMap` processes only `next` values, while we need to end `tenantAgent` session
      // on `error` and `complete`. So at first we need to use `materialize` operator to convert all
      // `next`s, `error` and `complete` into `next` values containing `Notification` objects
      // of corrsponding kinds. Then prepend `Notification` objects of `error` and `complete` kinds
      // with ending `tenantAgent` session. Eventually we need to use `dematerialize` operator
      // to convert `next` values containing `Notification` objects back into `next`s, `error` and `complete`.
      materialize(),
      mergeMap((x) => (x.kind === 'E' || x.kind === 'C' ? tenantAgent.endSession().then(() => x) : of(x))),
      dematerialize(),
    )
  }
}
