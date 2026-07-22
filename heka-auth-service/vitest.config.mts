import { createRequire } from 'node:module'

import tsconfigPaths from 'vite-tsconfig-paths'
import type { Plugin } from 'vitest/config'
import { defineConfig } from 'vitest/config'

const require = createRequire(import.meta.url)

/**
 * tsc's decorator lowering emits `let Foo = class Foo extends Bar { ... }`
 * — a named class expression whose inner name matches the outer binding.
 * vite-node's SSR transform can suffix the inner class name (e.g. `class Foo2`),
 * and V8 then exposes `Foo.name === 'Foo2'`, which breaks MikroORM (its metadata
 * keys and `className` field both use `target.name`). Dropping the inner class
 * expression name lets V8 infer `.name` from the enclosing `let` binding.
 */
function stripNamedClassExpressions(code: string): string {
  return code.replace(
    /(\blet\s+([A-Za-z_$][\w$]*)\s*=\s*)class\s+\2(\s+extends\b|\s*\{)/g,
    (_, prefix, _name, tail) => `${prefix}class${tail}`,
  )
}

/**
 * Wrap bare identifier metadata refs so references to classes still in the
 * temporal dead zone at `__decorate` time resolve to `Object` instead of
 * throwing (mirrors `babel-plugin-transform-typescript-metadata`).
 */
function guardForwardMetadataRefs(code: string): string {
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
 * Transpile app TypeScript with `tsc` (not esbuild) so decorator metadata is
 * emitted — class-validator DTOs and MikroORM's ReflectMetadataProvider both
 * rely on `emitDecoratorMetadata`, which Vitest's default esbuild transform
 * drops. node_modules are left to Vite's native ESM loader (this is how the
 * ESM-only MikroORM v7 packages load cleanly, unlike under Jest/ts-jest).
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
        map: out.sourceMapText ? JSON.parse(out.sourceMapText) : null,
      }
    },
  }
}

export default defineConfig({
  plugins: [tsconfigPaths(), typescriptTransform()],
  test: {
    globals: true,
    include: ['src/**/*.{test,spec}.ts', 'test/**/*.{test,spec}.ts'],
    testTimeout: 1_200_000,
    hookTimeout: 1_200_000,
    // Mirror the `jest --runInBand`: a single forked process. The e2e
    // suite shares one Postgres connection/schema, so it must not run in
    // parallel workers.
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
  },
})
