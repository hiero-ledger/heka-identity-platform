import { Server } from 'net'

import request from 'supertest'

import { DidMethod, OpenId4VcCredentialFormat, ProtocolType } from 'common/types'
import {
  CreateIssuanceTemplateRequest,
  CreateIssuanceTemplateResponse,
  GetIssuanceTemplatesListRequest,
  GetIssuanceTemplatesListResponse,
  PatchIssuanceTemplateRequest,
} from 'issuance-template/dto'
import { uuid } from 'utils/misc'

export class IssuanceTemplateUtilities {
  public static makeCreateTemplateRequest = (
    req?: Partial<CreateIssuanceTemplateRequest>,
  ): CreateIssuanceTemplateRequest => ({
    name: req?.name ?? uuid(),
    protocol: req?.protocol ?? ProtocolType.Oid4vc,
    credentialFormat: req?.credentialFormat ?? OpenId4VcCredentialFormat.JwtVcJsonLd,
    network: req?.network ?? DidMethod.Key,
    did: req?.did ?? uuid(),
    schemaId: req?.schemaId ?? uuid(),
    fields: req?.fields ?? [],
  })

  public static async create(
    app: Server,
    authToken: string,
    req?: Partial<CreateIssuanceTemplateRequest>,
  ): Promise<CreateIssuanceTemplateResponse | undefined> {
    const response = await request(app)
      .post('/issuance-templates')
      .auth(authToken, { type: 'bearer' })
      .send({ ...this.makeCreateTemplateRequest(req) })
    if (response.status === 201) {
      return { ...response.body } as CreateIssuanceTemplateResponse
    } else {
      return undefined
    }
  }

  public static async setPinned(app: Server, authToken: string, templateId: string, pinned: boolean): Promise<boolean> {
    const response = await request(app)
      .patch(`/issuance-templates/${templateId}`)
      .auth(authToken, { type: 'bearer' })
      .send({ isPinned: pinned } as PatchIssuanceTemplateRequest)
    return response.status === 200
  }

  public static async get(app: Server, authToken: string, id: string): Promise<CreateIssuanceTemplateResponse> {
    const response = await request(app).get(`/issuance-templates/${id}`).auth(authToken, { type: 'bearer' })
    return { ...response.body } as CreateIssuanceTemplateResponse
  }

  public static async getList(
    app: Server,
    authToken: string,
    query: GetIssuanceTemplatesListRequest = {},
  ): Promise<GetIssuanceTemplatesListResponse> {
    const response = await request(app).get(`/issuance-templates`).auth(authToken, { type: 'bearer' }).query(query)
    return { ...response.body } as GetIssuanceTemplatesListResponse
  }
}
