import { v4 } from 'uuid'

export function uuid() {
  return v4()
}

export function notEmpty<TValue>(value: TValue | null | undefined): value is TValue {
  return value !== null && value !== undefined
}
