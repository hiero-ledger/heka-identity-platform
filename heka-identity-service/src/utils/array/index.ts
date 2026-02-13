export function moveElement(arr: any[], fromIndex: number, toIndex: number): void {
  const schemeElement = arr.splice(fromIndex, 1)[0]
  arr.splice(toIndex, 0, schemeElement)
}

export const intersect = (firstArray: string[], secondArray: string[]): string[] =>
  firstArray.filter((obj) => secondArray.some((item) => item === obj))

export const isDistinctItems = (array: string[]) => [...new Set(array)].length === array.length

export const isSubsetInArray = (subset: string[], array: string[]) => intersect(subset, array).length === subset.length

export function toRecord<T extends { [K in keyof T]: any }, K extends keyof T>(
  array: T[],
  selector: K,
): Record<T[K], Omit<T, K>> {
  return array.reduce((record, item) => ((record[item[selector]] = item), record), {} as Record<T[K], T>)
}
