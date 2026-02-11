import { KVStore } from '@keplr-wallet/common'
import AsyncStorage from '@react-native-async-storage/async-storage'

export class AsyncKVStore implements KVStore {
  public constructor(private readonly _prefix: string) {}

  public async get<T = unknown>(key: string): Promise<T | undefined> {
    const keyWithPrefix = this.prefix() + '/' + key
    const data = await AsyncStorage.getItem(keyWithPrefix)

    return data ? JSON.parse(data) : undefined
  }

  public set<T = unknown>(key: string, data: T | null): Promise<void> {
    const keyWithPrefix = this.prefix() + '/' + key

    if (!data) {
      return AsyncStorage.removeItem(keyWithPrefix)
    }

    return AsyncStorage.setItem(keyWithPrefix, JSON.stringify(data))
  }

  public prefix(): string {
    return this._prefix
  }
}
