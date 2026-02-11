export function tryParseInt(value: string | null | undefined, defaultValue: number): number
export function tryParseInt(value: string | null | undefined): number | null
export function tryParseInt(value: string | null | undefined, defaultValue?: number): number | null {
  return value && !Number.isNaN(Number.parseInt(value)) ? Number.parseInt(value!) : defaultValue ?? null
}
