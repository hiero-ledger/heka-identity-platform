// This helper is kept in its own file so the credential mappers (`sd-jwt.ts`, `mdoc.ts`)
// can import it without transitively pulling in `@credo-ts/anoncreds` via `utils.ts`.
// Credo package ships pure-ESM which currently breaks Jest-based unit tests.
export function humanizeAttributeName(name: string): string {
  return name.replace(/_/g, ' ')
}
