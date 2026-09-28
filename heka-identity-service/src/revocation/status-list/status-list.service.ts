import { Bitstring } from '@digitalcredentials/bitstring'
import { EntityManager, LockMode } from '@mikro-orm/core'
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

/** Indexes reserved for one issuance, all in the same list. */
export interface ReservedStatusListIndexes {
  id: string
  indexes: number[]
}

/**
 * W3C Bitstring Status Lists for W3C VCs (SD-JWT VCs use the IETF token status list instead).
 *
 * Every read-modify-write of a list (`encodedList`, `lastIndex`) runs in one transaction holding a row lock:
 * two concurrent offers must never be handed the same index, and two concurrent revocations must never
 * drop each other's bit.
 */
@Injectable()
export class StatusListService {
  public constructor(
    private readonly em: EntityManager,
    @Inject(ExpressConfig.KEY)
    private readonly appConfig: ConfigType<typeof ExpressConfig>,
  ) {}

  public async create(
    authInfo: AuthInfo,
    req: CreateStatusListRequest,
    em: EntityManager = this.em,
  ): Promise<CredentialStatusList> {
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

    em.persist(statusList)
    await em.flush()

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

  public assertHasFreeIndexes(statusList: CredentialStatusList, count: number): void {
    if (statusList.lastIndex + count > statusList.size) {
      throw new BadRequestException('Status list does not have enough free indexes')
    }
  }

  /**
   * Reserve `count` consecutive indexes in one locked transaction, creating a list when none has room.
   * Indexes are 0-based: `lastIndex` is the next free index, so a list of `size` bits holds `0 … size - 1`.
   */
  public async reserveIndexes(authInfo: AuthInfo, issuer: string, count: number): Promise<ReservedStatusListIndexes> {
    if (!Number.isInteger(count) || count < 1) {
      throw new BadRequestException('At least one status list index must be reserved')
    }
    return this.em.transactional(async (em) => {
      const lists = await em.find(
        CredentialStatusList,
        { owner: authInfo.user },
        { lockMode: LockMode.PESSIMISTIC_WRITE },
      )
      let statusList = lists.find((candidate) => candidate.lastIndex + count <= candidate.size)
      if (!statusList) {
        statusList = await this.create(authInfo, { issuer }, em)
        // A reservation larger than a whole list can never be satisfied; the transaction discards the new list.
        this.assertHasFreeIndexes(statusList, count)
      }

      const indexes = Array.from({ length: count }, (_, offset) => statusList.lastIndex + offset)
      statusList.encodedList = await this.updatedBitstring(statusList.encodedList, statusList.size, indexes, false)
      statusList.lastIndex += count
      await em.flush()

      return { id: statusList.id, indexes }
    })
  }

  public async updateItems(authInfo: AuthInfo, id: string, data: UpdateStatusListRequest): Promise<void> {
    await this.em.transactional(async (em) => {
      const statusList = await em.findOneOrFail(
        CredentialStatusList,
        { id, owner: authInfo.user },
        { lockMode: LockMode.PESSIMISTIC_WRITE },
      )

      statusList.encodedList = await this.updatedBitstring(
        statusList.encodedList,
        statusList.size,
        data.indexes,
        data.revoked,
      )

      await em.flush()
    })
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
