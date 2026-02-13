import { createMock } from '@golevelup/ts-jest'
import { EntityManager } from '@mikro-orm/core'
import { when } from 'jest-when'

import { Role } from 'common/auth'
import { MessageDeliveryType, User } from 'common/entities'
import { Logger } from 'common/logger'
import { OpenId4VcIssuerService } from 'openid4vc/issuer/issuer.service'

import { FileStorageService } from '../../common/file-storage/file-storage.service'
import { UserService } from '../user.service'

describe('UserService', () => {
  let em: EntityManager
  let logger: Logger
  let userService: UserService
  let issuerService: OpenId4VcIssuerService
  let fileStorageService: FileStorageService

  beforeEach(() => {
    em = createMock<EntityManager>()
    logger = createMock<Logger>()
    issuerService = createMock<OpenId4VcIssuerService>()
    fileStorageService = createMock<FileStorageService>()
    userService = new UserService(em, logger, issuerService, fileStorageService)
  })

  test('getMe return authenticated user', async () => {
    when(em.findOneOrFail)
      .calledWith(User, { id: '11' })
      .mockResolvedValue(
        new User({
          id: '11',
          messageDeliveryType: MessageDeliveryType.WebSocket,
          backgroundColor: '#F58529',
          name: 'Cameron',
          logo: 'https://test.logo',
        }),
      )

    when(fileStorageService.url).mockReturnValue('https://test.logo')

    const userDto = await userService.getMe({
      userId: '11',
      user: { id: '11' } as User,
      userName: 'test',
      role: Role.Issuer,
      orgId: '7',
      walletId: 'Issuer_11_in_Organization_7',
      tenantId: '123',
    })

    expect(em.findOneOrFail).toBeCalledTimes(1)
    expect(em.findOneOrFail).toBeCalledWith(User, { id: '11' })
    expect(userDto.messageDeliveryType).toBe(MessageDeliveryType.WebSocket)
    expect(userDto.webHook).toBeUndefined()
    expect(userDto.backgroundColor).toBe('#F58529')
    expect(userDto.name).toBe('Cameron')
    expect(userDto.logo).toBe('https://test.logo')
  })
})
