import { TokenType } from '@core/database/entities/token.entity'
import { EntityRepository } from '@mikro-orm/core'

import { Token } from '../entities'

export class TokenRepository extends EntityRepository<Token> {
  public async put(data: {
    type: TokenType
    token: string
    expireIn?: Date
    subject?: string
    payload?: any
  }): Promise<Token> {
    const newToken = new Token({
      ...data,
      isRevoked: false,
    })
    await this.em.persistAndFlush(newToken)
    return newToken
  }

  public async updateToken(data: { id: string; token: string }): Promise<void> {
    await this.em.nativeUpdate(Token, { id: data.id }, { token: data.token })
  }

  public async getById(id: string): Promise<Token | null> {
    return await this.em.findOne(Token, { id, isRevoked: false, expireIn: { $gt: new Date() } })
  }

  public async revoke(token: string) {
    await this.em.nativeUpdate(Token, { token }, { isRevoked: true })
  }

  public async revokeByTypeAndSubject(type: TokenType, subject: string) {
    const storedTokens = await this.em.find(Token, {
      type: type,
      subject: subject,
      isRevoked: false,
      expireIn: { $gt: new Date() },
    })
    for (const t of storedTokens) {
      await this.revoke(t.token)
    }
  }

  public async get(token: string): Promise<Token | null> {
    return await this.em.findOne(Token, { token, isRevoked: false, expireIn: { $gt: new Date() } })
  }
}
