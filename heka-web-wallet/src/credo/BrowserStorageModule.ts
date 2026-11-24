import { InjectionSymbols, type DependencyManager, type Module } from '@credo-ts/core'

import { IndexedDbStorageService } from './IndexedDbStorageService'

export class BrowserStorageModule implements Module {
  public register(dependencyManager: DependencyManager): void {
    dependencyManager.registerInstance(InjectionSymbols.StorageService, new IndexedDbStorageService())
  }
}
