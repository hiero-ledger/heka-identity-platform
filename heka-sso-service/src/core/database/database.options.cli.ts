import process from 'node:process'

import { DbConfig } from '@core/config/configs/db.config'
import type { Options } from '@mikro-orm/postgresql'
import { defineConfig } from '@mikro-orm/postgresql'
import { config as environmentConfig } from 'dotenv'
import dotEnvExpand from 'dotenv-expand'

import { databaseOptions } from './database.options'

const environment = process.env.NODE_ENV
  ? `${process.cwd()}/env/.env.${process.env.NODE_ENV}`
  : `${process.cwd()}/env/.env`

dotEnvExpand.expand(
  environmentConfig({
    path: environment,
  }),
)

const config: Options = defineConfig({
  ...databaseOptions(new DbConfig(process.env)),
})

export default config
