import { Bitstring } from '@digitalcredentials/bitstring'
import { EntityManager } from '@mikro-orm/core'
import { BadRequestException, Inject, Injectable, InternalServerErrorException } from '@nestjs/common'
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

// W3C Bitstring Status List v1.0 (§2.2, §3.3) requires `encodedList` to be a Multibase-encoded base64url string
const MULTIBASE_BASE64URL_PREFIX = 'u'

function toMultibaseBase64url(base64url: string): string {
  return `${MULTIBASE_BASE64URL_PREFIX}${base64url}`
}

function fromMultibaseBase64url(encodedList: string): string {
  if (!encodedList.startsWith(MULTIBASE_BASE64URL_PREFIX)) {
    throw new InternalServerErrorException('Stored status list is not Multibase base64url-encoded')
  }
  return encodedList.slice(MULTIBASE_BASE64URL_PREFIX.length)
}

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
    const encodedList = toMultibaseBase64url(await bitstring.encodeBits())

    const statusList = new CredentialStatusList({
      encodedList,
      size,
      purpose: req.purpose,
      issuer: req.issuer,
      owner: authInfo.user,
    })

    this.em.persist(statusList)
    await this.em.flush()

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

  public assertHasFreeIndexes(statusList: CredentialStatusList, count: number): void {
    if (statusList.lastIndex + count > statusList.size) {
      throw new BadRequestException('Status list does not have enough free indexes')
    }
  }

  public async addItems(authInfo: AuthInfo, id: string, indexes: Array<number>): Promise<void> {
    const statusList = await this.em.findOneOrFail(CredentialStatusList, { id, owner: authInfo.user })

    this.assertHasFreeIndexes(statusList, indexes.length)

    statusList.encodedList = await this.updatedBitstring(statusList.encodedList, statusList.size, indexes, false)
    statusList.lastIndex += indexes.length

    await this.em.flush()
  }

  public async updateItems(authInfo: AuthInfo, id: string, data: UpdateStatusListRequest): Promise<void> {
    const statusList = await this.em.findOneOrFail(CredentialStatusList, { id, owner: authInfo.user })

    statusList.encodedList = await this.updatedBitstring(
      statusList.encodedList,
      statusList.size,
      data.indexes,
      data.revoked,
    )

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

  private async updatedBitstring(
    encodedList: string,
    size: number,
    indexes: Array<number>,
    revoked: boolean,
  ): Promise<string> {
    const decodedList = await Bitstring.decodeBits({ encoded: fromMultibaseBase64url(encodedList) })
    const bitstring = new Bitstring({ buffer: decodedList })

    for (const index of indexes) {
      if (index < 0 || index >= size) {
        throw new BadRequestException('Status list index is out of bounds')
      }
      bitstring.set(index, revoked)
    }

    return toMultibaseBase64url(await bitstring.encodeBits())
  }
}
