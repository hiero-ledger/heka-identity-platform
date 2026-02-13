type Entry = [string, any]

export const fromEntries = (entries: Entry[]) =>
  entries.reduce((obj, [key, val]) => Object.assign(obj, { [key]: val }), {})

type FilterFn = (entry: Entry) => boolean

export const filter = (obj: object, fn: FilterFn) => fromEntries(Object.entries(obj).filter(fn))

export const filterUndefined = (obj: object) => filter(obj, ([, value]) => typeof value !== 'undefined')

type ReplicateFn<T> = (index: number) => T

export function replicate<T>(count: number, fn: ReplicateFn<T>): T[] {
  const objects: T[] = []

  for (let i = 0; i < count; i++) {
    objects.push(fn(i))
  }

  return objects
}

export function undefinedToNull(obj: { [key: string]: any }) {
  for (const key in obj) {
    if (obj[key] === undefined) {
      obj[key] = null
    }
  }
}

export function enumKeys<E extends object>(e: E): (keyof E)[] {
  return Object.keys(e) as (keyof E)[]
}
