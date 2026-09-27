import { ClassConstructor, plainToInstance } from 'class-transformer'

export function classFromJson<T>(str: string, type: ClassConstructor<T>): T {
  const jsonObj = JSON.parse(str)
  return classFromObject(jsonObj, type)
}

export function classFromObject<T>(data: object, type: ClassConstructor<T>): T {
  return plainToInstance(type, data)
}
