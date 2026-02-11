import { randomSort } from '../../src/utils/sort'

describe('Sort Utils', () => {
  describe('randomSort', () => {
    it('should return the same array', () => {
      const array = Array.from(Array(10).keys())

      const sortedArray = randomSort(array)

      expect(sortedArray.sort()).toBe(array)
    })
  })
})
