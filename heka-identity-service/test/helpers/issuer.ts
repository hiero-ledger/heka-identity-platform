import { Server } from 'net'

import request from 'supertest'

import { FindIssuerDto, OpenId4VcIssuerRecordDto, OpenId4VcIssuersCreateDto } from 'openid4vc/issuer/dto'
import { uuid } from 'utils/misc'

export class OpenID4VCIssuerUtilities {
  public static async create(
    app: Server,
    authToken: string,
    req?: Partial<OpenId4VcIssuersCreateDto>,
  ): Promise<OpenId4VcIssuerRecordDto | undefined> {
    const response = await request(app)
      .post(`/openid4vc/issuer/`)
      .auth(authToken, { type: 'bearer' })
      .send({
        ...req,
        publicIssuerId: req?.publicIssuerId ? req.publicIssuerId : uuid(),
        credentialsSupported: req?.credentialsSupported ? req.credentialsSupported : [],
      } as OpenId4VcIssuersCreateDto)

    if (response.status === 200) {
      return { ...response.body } as OpenId4VcIssuerRecordDto
    } else {
      return undefined
    }
  }

  public static async find(
    app: Server,
    authToken: string,
    publicIssuerId: string,
  ): Promise<OpenId4VcIssuerRecordDto[]> {
    const response = await request(app)
      .get(`/openid4vc/issuer`)
      .auth(authToken, { type: 'bearer' })
      .query({ publicIssuerId } as FindIssuerDto)
    return { ...response.body } as OpenId4VcIssuerRecordDto[]
  }
}
