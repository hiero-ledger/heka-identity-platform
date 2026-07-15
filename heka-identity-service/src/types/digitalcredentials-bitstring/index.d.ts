/**
 * Ambient type declarations for @digitalcredentials/bitstring.
 *
 * This package ships without TypeScript type definitions.
 * These declarations cover the API surface used by this project.
 *
 * Structured as a typeRoot package (folder + index.d.ts) and registered via
 * `types` in tsconfig.json so it is always loaded during program creation —
 * regardless of `include` globs or ts-node's `files` setting. (As a global
 * `declare module` it is otherwise only picked up when the file happens to be
 * a root of the program, which ts-node does not guarantee).
 *
 * @see https://github.com/digitalcredentials/bitstring
 */
declare module '@digitalcredentials/bitstring' {
  export class Bitstring {
    public constructor(options: { length: number } | { buffer: Uint8Array })

    /**
     * Set the bit at the given position.
     * @param position - The zero-based index of the bit.
     * @param on - Whether to set (true) or unset (false) the bit.
     */
    public set(position: number, on: boolean): void

    /**
     * Get the bit value at the given position.
     * @param position - The zero-based index of the bit.
     * @returns Whether the bit is set.
     */
    public get(position: number): boolean

    /**
     * Encode the bitstring to a compressed base64url string.
     */
    public encodeBits(): Promise<string>

    /**
     * Decode a compressed base64url string to a Uint8Array buffer.
     */
    public static decodeBits(options: { encoded: string }): Promise<Uint8Array>
  }
}
