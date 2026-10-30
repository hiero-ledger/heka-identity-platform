import { EventEmitter } from 'events'

import type { AgentDependencies, FileSystem } from '@credo-ts/core'

class BrowserFileSystem implements FileSystem {
  public readonly dataPath = '/data'
  public readonly cachePath = '/cache'
  public readonly tempPath = '/temp'

  public async exists(): Promise<boolean> {
    return false
  }

  public async createDirectory(): Promise<void> {}

  public async copyFile(): Promise<void> {}

  public async write(): Promise<void> {
    throw new Error('FileSystem.write is not available in the browser extension')
  }

  public async read(): Promise<string> {
    throw new Error('FileSystem.read is not available in the browser extension')
  }

  public async delete(): Promise<void> {
    throw new Error('FileSystem.delete is not available in the browser extension')
  }

  public async downloadToFile(): Promise<void> {
    throw new Error('FileSystem.downloadToFile is not available in the browser extension')
  }
}

export const browserAgentDependencies: AgentDependencies = {
  FileSystem: BrowserFileSystem,
  EventEmitterClass: EventEmitter as AgentDependencies['EventEmitterClass'],
  fetch: globalThis.fetch.bind(globalThis),
  WebSocketClass: globalThis.WebSocket as unknown as AgentDependencies['WebSocketClass'],
}
