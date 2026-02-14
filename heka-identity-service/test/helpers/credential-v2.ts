import { Server } from 'net'

import request from 'supertest'

import { OfferByIssuanceTemplateRequest, OfferByIssuanceTemplateResponse } from 'credential-v2/dto'
import {
  ProofByVerificationTemplateRequest,
  ProofByVerificationTemplateResponse,
} from 'credential-v2/dto/proof-by-template'

export class CredentialV2Utilities {
  public static async issueByTemplate(
    app: Server,
    authToken: string,
    req: OfferByIssuanceTemplateRequest,
  ): Promise<OfferByIssuanceTemplateResponse | undefined> {
    const response = await request(app)
      .post('/v2/credentials/offer-by-template')
      .auth(authToken, { type: 'bearer' })
      .send(req)
    if (response.status === 201) {
      return { ...response.body } as OfferByIssuanceTemplateResponse
    } else {
      return undefined
    }
  }

  public static async proofByTemplate(
    app: Server,
    authToken: string,
    req: ProofByVerificationTemplateRequest,
  ): Promise<ProofByVerificationTemplateResponse | undefined> {
    const response = await request(app)
      .post('/v2/credentials/proof-by-template')
      .auth(authToken, { type: 'bearer' })
      .send(req)
    if (response.status === 201) {
      return { ...response.body } as ProofByVerificationTemplateResponse
    } else {
      return undefined
    }
  }
}
