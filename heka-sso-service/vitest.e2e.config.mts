import { defineConfig } from 'vitest/config'

import baseConfig from './vitest.config.mts'

/**
 * E2E runner (P1.8): same transform pipeline as the base config, but only the
 * e2e files, with the `E2E` gate switched on. Needs the dev Postgres
 * (`docker-compose.dev.yml`, port 5434). Invoked via `yarn test:e2e`.
 *
 * The suite drops and recreates its schema, so it runs against a dedicated
 * database (never the dev bridge's `heka-sso-service` — that would wipe the
 * persisted signing keys and live provider state). Create it once:
 * `docker exec <postgres-container> createdb -U heka heka-sso-service-e2e`.
 * A `MIKRO_ORM_DB` in the environment still wins.
 */
export default defineConfig({
  ...baseConfig,
  test: {
    ...baseConfig.test,
    env: {
      ...(baseConfig.test?.env ?? {}),
      E2E: 'true',
      MIKRO_ORM_DB: process.env.MIKRO_ORM_DB ?? 'heka-sso-service-e2e',
    },
    include: ['test/**/*.e2e.test.ts'],
  },
})
