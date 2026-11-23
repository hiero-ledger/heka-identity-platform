import { isBitSet, setBit } from '..'

describe('bitmap', () => {
  test('sets bits least significant first within each byte', () => {
    const bitmap = new Uint8Array(2)

    setBit(bitmap, 0)
    setBit(bitmap, 3)
    setBit(bitmap, 9)

    expect(Array.from(bitmap)).toEqual([0b00001001, 0b00000010])
  })

  test('reads back only the bits that were set', () => {
    const bitmap = new Uint8Array(2)
    setBit(bitmap, 3)
    setBit(bitmap, 15)

    expect([...Array(16).keys()].filter((index) => isBitSet(bitmap, index))).toEqual([3, 15])
  })

  test('setting a bit twice keeps it set and leaves the others', () => {
    const bitmap = Uint8Array.from([0b10000000])

    setBit(bitmap, 1)
    setBit(bitmap, 1)

    expect(Array.from(bitmap)).toEqual([0b10000010])
  })
})
