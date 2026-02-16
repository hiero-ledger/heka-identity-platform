import agent from './agent'
import express from './express'
import fileStorage from './file-storage'
import health from './health'
import jwt from './jwt'
import mikroOrm from './mikro-orm'
import pino from './pino'

export default [agent, express, health, jwt, mikroOrm, pino, fileStorage]
