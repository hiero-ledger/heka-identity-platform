import { Server } from 'net'

import request from 'supertest'

import { DidMethod } from 'common/types'
import { CreateDidRequestDto, DidDocumentDto, UpdateDidRequestDto } from 'did/dto'

export class DidUtilities {
  public static async create(app: Server, authToken: string, method: DidMethod): Promise<DidDocumentDto | undefined> {
    const response = await request(app)
      .post('/dids')
      .auth(authToken, { type: 'bearer' })
      .send({ method } satisfies CreateDidRequestDto)

    if (response.status === 201) {
      return { ...response.body } as DidDocumentDto
    } else {
      return undefined
    }
  }

  public static async get(app: Server, authToken: string, did: string): Promise<DidDocumentDto> {
    const response = await request(app).get(`/dids/${did}`).auth(authToken, { type: 'bearer' })
    return { ...response.body } as DidDocumentDto
  }

  /** `PATCH /dids/:did`; the response is returned as is, so callers can assert error statuses too. */
  public static update(app: Server, authToken: string, did: string, body: UpdateDidRequestDto | object) {
    return request(app).patch(`/dids/${did}`).auth(authToken, { type: 'bearer' }).send(body)
  }

  /** `POST /dids/:did/deactivate`; the response is returned as is. */
  public static deactivate(app: Server, authToken: string, did: string) {
    return request(app).post(`/dids/${did}/deactivate`).auth(authToken, { type: 'bearer' }).send()
  }
}
