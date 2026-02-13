import { Server } from 'net'

import request from 'supertest'

import { Role } from 'common/auth'
import { PrepareWalletRequestDto } from 'prepare-wallet/dto/prepare-wallet.dto'
import { uuid } from 'utils/misc'

import { createAuthToken } from './jwt'

export class UserUtilities {
  public static async register(app: Server, user?: { id?: string; role?: Role }): Promise<string | undefined> {
    const uid = user?.id ?? uuid()
    const role = user?.role ?? Role.User
    const userToken = await createAuthToken(uid, role)
    const userResponse = await request(app).get('/user').auth(userToken, { type: 'bearer' })
    if (userResponse.status === 200) {
      return userToken
    } else {
      return undefined
    }
  }

  public static async prepareWallet(app: Server, authToken: string): Promise<string | undefined> {
    const response = await request(app)
      .post('/prepare-wallet')
      .auth(authToken, { type: 'bearer' })
      .send({} as PrepareWalletRequestDto)
    if (response.status === 201) {
      return response.body.did
    } else {
      return undefined
    }
  }
}
