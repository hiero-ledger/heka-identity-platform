import agent from './agent'
import demo from './demo'
import express from './express'
import fileStorage from './file-storage'
import health from './health'
import mikroOrm from './mikro-orm'
import oidc from './oidc'
import pino from './pino'
import webhook from './webhook'

export default [agent, express, health, oidc, demo, mikroOrm, pino, fileStorage, webhook]
