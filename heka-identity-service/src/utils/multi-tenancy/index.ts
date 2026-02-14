import type { Agent, TenantAgent } from 'common/agent'

export interface TenantAgentOptions {
  agent: Agent
  tenantId: string
}

export function withTenantAgent<T>(
  options: TenantAgentOptions,
  callback: (tenantAgent: TenantAgent) => Promise<T>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    let result: T

    options.agent.modules.tenants
      .withTenantAgent(
        {
          tenantId: options.tenantId,
        },
        async (tenantAgent) => {
          result = await callback(tenantAgent)
        },
      )
      .then(() => {
        resolve(result)
      })
      .catch((error) => {
        reject(error)
      })
  })
}
