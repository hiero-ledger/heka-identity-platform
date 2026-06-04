// Vitest runs each test file in an isolated src-module graph, but keeps
// `node_modules` modules cached across files. `@mikro-orm/core` keeps a
// static `MetadataStorage.metadata` map that accumulates registered
// entity classes as their modules load. Without clearing it between test
// files, the second file's re-evaluation of an entity class collides with
// the leftover registration from the first file, and MikroORM renames the
// new class to e.g. `Schema2` — which in turn breaks string-based
// relations like `@OneToMany('SchemaField', 'schema')`.
//
// We run as a setupFile, which executes before the test file's src
// imports, so the reset happens before entities re-register.
// Native bindings that must be registered before any @openwallet-foundation
// or @credo-ts module loads. The production `start` script achieves this via
// `-r @openwallet-foundation/askar-nodejs`; under Vitest we import it from
// the setup file, which runs before the test file's src imports.
import '@openwallet-foundation/askar-nodejs'

import { MetadataStorage } from '@mikro-orm/core'

const storage = MetadataStorage as unknown as { metadata: Record<string, unknown> }
if (storage.metadata && typeof storage.metadata === 'object') {
  for (const key of Object.keys(storage.metadata)) {
    delete storage.metadata[key]
  }
}
