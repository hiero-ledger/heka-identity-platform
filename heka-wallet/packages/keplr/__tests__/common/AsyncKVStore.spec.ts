import { AsyncKVStore } from '../../src/common/AsyncKVStore'
import { mockFunction } from '../../../../jest-helpers/helpers'
import AsyncStorage from '@react-native-async-storage/async-storage'

const testPrefix = 'test-prefix'
const testKey = 'test-key'

const prefixedTestKey = `${testPrefix}/${testKey}`

const testValue = { value: 'test-value' }

describe('AsyncKVStore', () => {
  const asyncKeyValueStore = new AsyncKVStore(testPrefix)

  it('should return correct prefix', () => {
    expect(asyncKeyValueStore.prefix()).toBe(testPrefix)
  })

  it('should get JSON value from AsyncStorage', async () => {
    mockFunction(AsyncStorage.getItem).mockResolvedValueOnce(JSON.stringify(testValue))

    const value = await asyncKeyValueStore.get(testKey)

    expect(value).toStrictEqual(testValue)
    expect(AsyncStorage.getItem).toBeCalledTimes(1)
    expect(AsyncStorage.getItem).toBeCalledWith(prefixedTestKey)
  })

  it('should set value in AsyncStorage', async () => {
    await asyncKeyValueStore.set(testKey, testValue)

    expect(AsyncStorage.setItem).toBeCalledTimes(1)
    expect(AsyncStorage.setItem).toBeCalledWith(prefixedTestKey, JSON.stringify(testValue))
  })
})
