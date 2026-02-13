import { Server } from 'net'

import request from 'supertest'

import { DidMethod, OpenId4VcCredentialFormat, ProtocolType } from 'common/types'
import { uuid } from 'utils/misc'
import {
  CreateVerificationTemplateRequest,
  CreateVerificationTemplateResponse,
  GetVerificationTemplatesListRequest,
  GetVerificationTemplatesListResponse,
  PatchVerificationTemplateRequest,
} from 'verification-template/dto'

export class VerificationTemplateUtilities {
  public static makeCreateTemplateRequest = (
    req?: Partial<CreateVerificationTemplateRequest>,
  ): CreateVerificationTemplateRequest => ({
    name: req?.name ?? uuid(),
    protocol: req?.protocol ?? ProtocolType.Oid4vc,
    credentialFormat: req?.credentialFormat ?? OpenId4VcCredentialFormat.SdJwtVc,
    network: req?.network ?? DidMethod.Key,
    did: req?.did ?? uuid(),
    schemaId: req?.schemaId ?? uuid(),
    fields: req?.fields ?? [],
  })

  public static async create(
    app: Server,
    authToken: string,
    req?: Partial<CreateVerificationTemplateRequest>,
  ): Promise<CreateVerificationTemplateResponse | undefined> {
    const response = await request(app)
      .post('/verification-templates')
      .auth(authToken, { type: 'bearer' })
      .send({ ...this.makeCreateTemplateRequest(req) })
    if (response.status === 201) {
      return { ...response.body } as CreateVerificationTemplateResponse
    } else {
      return undefined
    }
  }

  public static async setPinned(app: Server, authToken: string, templateId: string, pinned: boolean): Promise<boolean> {
    const response = await request(app)
      .patch(`/verification-templates/${templateId}`)
      .auth(authToken, { type: 'bearer' })
      .send({ isPinned: pinned } as PatchVerificationTemplateRequest)
    return response.status === 200
  }

  public static async get(app: Server, authToken: string, id: string): Promise<CreateVerificationTemplateResponse> {
    const response = await request(app).get(`/verification-templates/${id}`).auth(authToken, { type: 'bearer' })
    return { ...response.body } as CreateVerificationTemplateResponse
  }

  public static async getList(
    app: Server,
    authToken: string,
    query: GetVerificationTemplatesListRequest = {},
  ): Promise<GetVerificationTemplatesListResponse> {
    const response = await request(app).get(`/verification-templates`).auth(authToken, { type: 'bearer' }).query(query)
    return { ...response.body } as GetVerificationTemplatesListResponse
  }
}
