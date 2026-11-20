/**
 * Bitmaps in a byte array, least significant bit first: index 0 is bit 0 of byte 0, index 8 is bit 0 of byte 1.
 * The order the IETF Token Status List uses for its status bits.
 */

export const isBitSet = (bitmap: Uint8Array, index: number): boolean => (bitmap[index >> 3] & (1 << (index & 7))) !== 0

export const setBit = (bitmap: Uint8Array, index: number): void => {
  bitmap[index >> 3] |= 1 << (index & 7)
}
