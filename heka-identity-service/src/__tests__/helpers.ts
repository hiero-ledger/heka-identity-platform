import type { MockedFunction } from 'vitest'

export { pino as testLogger } from 'pino'

export function mockFunction<T extends (...args: any[]) => any>(fn: T): MockedFunction<T> {
  return fn as MockedFunction<T>
}
