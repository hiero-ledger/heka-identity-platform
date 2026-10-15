import { RequestHandler } from 'express'
import { v4 as uuid } from 'uuid'

const CORRELATION_ID_HEADER = 'x-correlation-id'

export const correlationIdMiddleware: RequestHandler = (req, res, next) => {
  const incomingCorrelationId = req.get(CORRELATION_ID_HEADER)?.trim()
  const correlationId = incomingCorrelationId || uuid()

  req.headers[CORRELATION_ID_HEADER] = correlationId
  res.setHeader('X-Correlation-Id', correlationId)

  next()
}
