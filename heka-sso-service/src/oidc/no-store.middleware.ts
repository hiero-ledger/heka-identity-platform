import type { NextFunction, Request, Response } from 'express'

export const noStoreMiddleware = (_req: Request, res: Response, next: NextFunction): void => {
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Pragma', 'no-cache')
  next()
}
