import { Encoder } from 'cbor-x'

/**
 * Single cbor-x encoder for the VICAL code. We deliberately avoid cbor-x's exported `Tag` class:
 * under the test runner's mixed ESM/CJS loading the exported `Tag` and the encoder's internal `Tag`
 * resolve to different copies, so the encoder fails to recognize a `Tag` and silently serializes it as
 * a plain object. Instead, CBOR tags are produced without that class — date-times via native JS `Date`
 * (cbor-x emits a standard CBOR time tag) and the COSE_Sign1 wrapper via a manual tag head byte (see
 * cose-sign1.ts). This relies only on globals (`Date`, `BigInt`, `Map`, `Uint8Array`), which are
 * identity-stable across module copies.
 *
 * `useRecords: false` keeps objects as plain CBOR maps (not cbor-x record tags); `useTag259ForMaps:
 * false` keeps `Map`s as plain CBOR maps (cbor-x otherwise wraps every `Map` in its tag-259 extension,
 * which is non-standard and unreadable by a generic CBOR/VICAL parser); `tagUint8Array: false` keeps
 * byte strings as CBOR major-type-2 (not typed-array tags).
 */
// `useTag259ForMaps` is a valid cbor-x runtime option but is missing from its published types; passing
// the options via a variable avoids the excess-property check while keeping it type-checked otherwise.
const encoderOptions = { useRecords: false, useTag259ForMaps: false, tagUint8Array: false }
const encoder = new Encoder(encoderOptions)

export const cborEncode = (value: unknown): Uint8Array => encoder.encode(value)

export const cborDecode = (bytes: Uint8Array): unknown => encoder.decode(bytes)

/** Structurally unwrap a decoded CBOR tag value (avoids relying on `instanceof Tag`). */
export const unwrapCborTag = (value: unknown): unknown =>
  value && typeof value === 'object' && 'value' in value && 'tag' in value ? (value as { value: unknown }).value : value
