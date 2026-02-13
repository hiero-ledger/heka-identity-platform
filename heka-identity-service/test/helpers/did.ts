import { Server } from 'net'

import request from 'supertest'

import { DidMethod } from 'common/types'
import { CreateDidRequestDto, DidDocumentDto } from 'did/dto'

export class DidUtilities {
  public static async create(app: Server, authToken: string, method: DidMethod): Promise<DidDocumentDto | undefined> {
    const response = await request(app)
      .post('/dids')
      .auth(authToken, { type: 'bearer' })
      .send({ method } as CreateDidRequestDto)

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
}
