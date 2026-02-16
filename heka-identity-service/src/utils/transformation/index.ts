import { plainToInstance, Transform, TransformFnParams } from 'class-transformer'
import { ClassConstructor } from 'class-transformer/types/interfaces'
import { isString } from 'class-validator'

// eslint-disable-next-line @typescript-eslint/no-unsafe-call
export const TrimTransformer = (params: TransformFnParams) => params.value?.trim()

export const ToBooleanTransformer = (params: TransformFnParams) => {
  return params.obj[params.key] === 'true'
    ? true
    : params.obj[params.key] === 'false' || params.obj[params.key] === '' || params.obj[params.key] === undefined
      ? false
      : params.obj[params.key]
}

export const ToNullTransformer = (params: TransformFnParams) => {
  if (params.obj[params.key] === 'null') return null
  return params.obj[params.key]
}

export function TransformToArray(): (target: any, key: string) => void {
  return Transform((params: TransformFnParams) => {
    const { value } = params

    if (Array.isArray(value)) {
      return value
    }

    if (typeof value === 'string') {
      return value.split(',').map((item) => item.trim())
    }

    return []
  })
}

export const TransformDTOArray = <T>(cls: ClassConstructor<T>) => {
  return Transform(({ value }: TransformFnParams) => {
    if (value === '' || value === undefined || value === null) {
      return []
    }
    if (isString(value)) {
      return plainToInstance(cls, JSON.parse(value))
    }
    return plainToInstance(cls, value)
  })
}
