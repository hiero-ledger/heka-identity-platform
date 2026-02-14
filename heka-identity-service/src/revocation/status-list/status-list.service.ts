/* eslint @typescript-eslint/no-unsafe-call: 0 */

// No type definitions available for this package
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { Bitstring } from '@digitalcredentials/bitstring'
import { EntityManager } from '@mikro-orm/core'
import { BadRequestException, Inject, Injectable } from '@nestjs/common'
import { ConfigType } from '@nestjs/config'

import { CredentialStatusList } from 'common/entities'

import { AuthInfo } from '../../common/auth'
import { defaultCredentialStatusListSize } from '../../common/entities/credential-status-list.entity'
import ExpressConfig from '../../config/express'

import {
  CreateStatusListRequest,
  GetCredentialStatusListResponse,
  StatusList,
  UpdateStatusListRequest,
  CredentialStatusListSubject,
} from './dto'

@Injectable()
export class StatusListService {
  public constructor(
    private readonly em: EntityManager,
    @Inject(ExpressConfig.KEY)
    private readonly appConfig: ConfigType<typeof ExpressConfig>,
  ) {}

  public async create(authInfo: AuthInfo, req: CreateStatusListRequest): Promise<CredentialStatusList> {
    const size = req.size ?? defaultCredentialStatusListSize

    const bitstring = new Bitstring({ length: size })
    const encodedList = await bitstring.encodeBits()

    const statusList = new CredentialStatusList({
      encodedList,
      size,
      purpose: req.purpose,
      issuer: req.issuer,
      owner: authInfo.user,
    })

    await this.em.persistAndFlush(statusList)

    return statusList
  }

  public async get(authInfo: AuthInfo, id: string): Promise<StatusList> {
    const credentialStatusList = await this.em.findOneOrFail(CredentialStatusList, { id, owner: authInfo.user })
    return new StatusList({
      encodedList: credentialStatusList.encodedList,
      lastIndex: credentialStatusList.lastIndex,
      purpose: credentialStatusList.purpose,
      size: credentialStatusList.size,
    })
  }

  public async find(authInfo: AuthInfo): Promise<Array<StatusList>> {
    const credentialStatusLists = await this.em.find(CredentialStatusList, { owner: authInfo.user })
    return credentialStatusLists.map(
      (credentialStatusList) =>
        new StatusList({
          encodedList: credentialStatusList.encodedList,
          lastIndex: credentialStatusList.lastIndex,
          purpose: credentialStatusList.purpose,
          size: credentialStatusList.size,
        }),
    )
  }

  public async getOrCreate(authInfo: AuthInfo, issuer: string): Promise<CredentialStatusList> {
    const lists = await this.em.find(CredentialStatusList, {
      owner: authInfo.user,
    })
    const list = lists.find((list) => list.lastIndex < list.size)
    return list ?? (await this.create(authInfo, { issuer }))
  }

  public async addItems(authInfo: AuthInfo, id: string, indexes: Array<number>): Promise<void> {
    const statusList = await this.em.findOneOrFail(CredentialStatusList, { id, owner: authInfo.user })

    statusList.encodedList = await this.updatedBistring(statusList.encodedList, indexes, false)
    statusList.lastIndex = statusList.lastIndex += indexes.length

    await this.em.flush()
  }

  public async updateItems(authInfo: AuthInfo, id: string, data: UpdateStatusListRequest): Promise<void> {
    const statusList = await this.em.findOneOrFail(CredentialStatusList, { id, owner: authInfo.user })

    statusList.encodedList = await this.updatedBistring(statusList.encodedList, data.indexes, data.revoked)

    await this.em.flush()
  }

  public async getItemDetails(id: string): Promise<GetCredentialStatusListResponse> {
    const statusList = await this.em.findOneOrFail(CredentialStatusList, { id })
    return new GetCredentialStatusListResponse({
      id,
      issuer: statusList.issuer,
      validFrom: new Date().toISOString(),
      credentialSubject: new CredentialStatusListSubject({
        id,
        statusPurpose: statusList.purpose,
        encodedList: statusList.encodedList,
      }),
    })
  }

  public location(id: string) {
    return `${this.appConfig.appEndpoint}/credentials/status/${id}`
  }

  private async updatedBistring(encodedList: string, indexes: Array<number>, revoked: boolean): Promise<string> {
    // decode
    const decodedList = await Bitstring.decodeBits({ encoded: encodedList })
    const bitstring = new Bitstring({ buffer: decodedList })

    // set items
    for (const index of indexes) {
      if (index > decodedList.length) {
        throw new BadRequestException('Status list index is out of bounds')
      }
      bitstring.set(index, revoked)
    }

    // encode
    return await bitstring.encodeBits()
  }
}
