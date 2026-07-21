import type { Plugin } from 'vitest/config'

import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import tsconfigPaths from 'vite-tsconfig-paths'
import { defineConfig } from 'vitest/config'

const here = path.dirname(fileURLToPath(import.meta.url))
const srcDir = path.resolve(here, 'src')

const require = createRequire(import.meta.url)

/**
 * Post-processes tsc / SWC output so that `__metadata("design:type", X)` and
 * `__metadata("design:paramtypes", [X, Y])` calls are wrapped in a
 * `typeof X === "undefined" ? Object : X` guard. Several DTO files in this
 * codebase declare classes in a non-topological order (class A has a decorated
 * field typed as B where B is declared later in the same file); without the
 * guard this trips `ReferenceError: Cannot access 'X' before initialization`
 * at module load because the decorator metadata reference is evaluated while
 * the later class binding is still in TDZ. This mirrors what
 * `babel-plugin-transform-typescript-metadata` does.
 */
/**
 * tsc's decorator lowering emits `let Foo = class Foo extends Bar { ... }`
 * — a named class expression whose inner name matches the outer binding.
 * vite-node's SSR transform rewrites ESM into a CJS-like wrapper and, when
 * it encounters a named class expression whose name collides with another
 * top-level binding in its rewritten output, suffixes the inner class name
 * (e.g. `class Foo2 extends ...`). V8 then exposes `Foo.name === 'Foo2'`,
 * which breaks MikroORM: its metadata keys and `className` field both use
 * `target.name`, so every entity registers as `Foo2`, `User2`, `Wallet2`,
 * etc. — and string-based relations like `@OneToMany('SchemaField', ...)`
 * then fail discovery because the class is registered under the wrong key.
 *
 * Dropping the inner class expression name lets V8 infer `.name` from the
 * enclosing `let` binding instead, and vite-node leaves that inferred name
 * alone.
 */
function stripNamedClassExpressions(code: string): string {
  return code.replace(
    /(\blet\s+([A-Za-z_$][\w$]*)\s*=\s*)class\s+\2(\s+extends\b|\s*\{)/g,
    (_, prefix, _name, tail) => `${prefix}class${tail}`,
  )
}

function guardForwardMetadataRefs(code: string): string {
  // Wrap bare identifier metadata refs in an IIFE with try/catch so that
  // references to classes still in the temporal dead zone at `__decorate`
  // evaluation time resolve to `Object` instead of throwing. `typeof X`
  // alone is NOT safe: for `class`/`let`/`const` in TDZ it also throws.
  const guard = (name: string) => `(function(){try{return ${name}}catch(_){return Object}})()`
  code = code.replace(
    /__metadata\("design:(type|returntype)",\s*([A-Za-z_$][\w$]*)\)/g,
    (_, kind, name) => `__metadata("design:${kind}", ${guard(name)})`,
  )
  code = code.replace(/__metadata\("design:paramtypes",\s*\[([^\]]*)\]\)/g, (_, list: string) => {
    const items = list
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((item) => (/^[A-Za-z_$][\w$]*$/.test(item) ? guard(item) : item))
    return `__metadata("design:paramtypes", [${items.join(', ')}])`
  })
  return code
}

/**
 * A Vite plugin that transpiles TypeScript source using the `typescript`
 * compiler itself (`ts.transpileModule`) instead of esbuild/SWC.
 *
 * Rationale: Vitest's default esbuild transform does not emit decorator
 * metadata (`emitDecoratorMetadata`), and `unplugin-swc` emits forward
 * references to later-declared classes as bare identifiers — which crashes
 * at module load with `ReferenceError: Cannot access 'X' before initialization`
 * for any DTO file whose classes reference each other out-of-order (several
 * of which exist in this codebase). `tsc` also emits bare references, so we
 * additionally run `guardForwardMetadataRefs` over the output. This restores
 * the behavior the existing Jest+ts-jest setup relied on at the cost of
 * per-file transpile overhead comparable to ts-jest.
 */
function typescriptTransform(): Plugin {
  let ts: typeof import('typescript') | undefined
  return {
    name: 'heka-tsc-transform',
    enforce: 'pre',
    transform(code, id) {
      if (!/\.tsx?$/.test(id)) return null
      if (id.includes('/node_modules/')) return null
      if (!ts) ts = require('typescript')
      const out = ts!.transpileModule(code, {
        fileName: id,
        compilerOptions: {
          module: ts!.ModuleKind.ESNext,
          moduleResolution: ts!.ModuleResolutionKind.Bundler,
          target: ts!.ScriptTarget.ES2021,
          experimentalDecorators: true,
          emitDecoratorMetadata: true,
          esModuleInterop: true,
          allowSyntheticDefaultImports: true,
          resolveJsonModule: true,
          sourceMap: true,
          inlineSources: true,
          useDefineForClassFields: false,
        },
      })
      const finalCode = guardForwardMetadataRefs(stripNamedClassExpressions(out.outputText))
      return {
        code: finalCode,
        // Source map becomes slightly misaligned for the transformed lines
        // but stack traces still point to the correct source line ranges.
        map: out.sourceMapText ? JSON.parse(out.sourceMapText) : null,
      }
    },
  }
}

export default defineConfig({
  plugins: [tsconfigPaths(), typescriptTransform()],
  resolve: {
    // Force both `src/foo` and bare `foo` (via tsconfig-paths) specifiers to
    // resolve to the exact same absolute path. Without this, Vite can treat
    // the two forms as distinct modules and load a DTO/entity class twice,
    // which breaks MikroORM's name-based entity discovery
    // (`Entity 'SchemaField' was not discovered, used in Schema2.fields`).
    alias: [{ find: /^src\//, replacement: srcDir + '/' }],
  },
  test: {
    globals: true,
    include: ['src/**/*.{test,spec}.ts', 'test/**/*.{test,spec}.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'lcov', 'json', 'json-summary'],
      reportsDirectory: './coverage',
      include: ['src/**/*.service.ts'],
      exclude: ['src/**/__tests__/**', 'src/**/*.test.ts', 'src/**/*.spec.ts'],
    },
    testTimeout: 1_200_000,
    hookTimeout: 1_200_000,
    // `@mikro-orm/core` (and class-validator) maintain module-level singleton
    // registries that accumulate decorated classes as they load. Vitest's
    // default isolation resets the *src* module graph between test files but
    // keeps `node_modules` cached — so when the second test file re-evaluates
    // an entity class, MikroORM's storage sees the prior registration and
    // renames the new class to e.g. `Schema2`, breaking name-based relations
    // (`@OneToMany('SchemaField', 'schema')`). The setup file clears the
    // stale registries before each test file's src imports run.
    setupFiles: ['test/vitest.setup.ts'],
    // Native modules (askar, anoncreds, indy-vdr, zstd-napi) are incompatible
    // with Vitest's default worker_threads pool — run in a single forked
    // process, mirroring the previous `jest --runInBand` behavior.
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
  },
})
