import { createMock } from '@golevelup/ts-vitest'
import { EntityManager } from '@mikro-orm/core'

import { TenantAgent } from 'common/agent'
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
  let tenantAgent: TenantAgent

  const authInfo = {
    userId: '11',
    user: { id: '11' } as User,
    userName: 'test',
    role: Role.Issuer,
    orgId: '7',
    walletId: 'Issuer_11_in_Organization_7',
    tenantId: '123',
  }

  beforeEach(() => {
    em = createMock<EntityManager>()
    logger = createMock<Logger>()
    issuerService = createMock<OpenId4VcIssuerService>()
    fileStorageService = createMock<FileStorageService>()
    userService = new UserService(em, logger, issuerService, fileStorageService)
    tenantAgent = createMock<TenantAgent>()
  })

  test('getMe return authenticated user', async () => {
    vi.mocked(em.findOneOrFail).mockResolvedValue(
      new User({
        id: '11',
        messageDeliveryType: MessageDeliveryType.WebSocket,
        backgroundColor: '#F58529',
        name: 'Cameron',
        logo: 'https://test.logo',
      }),
    )

    vi.mocked(fileStorageService.url).mockReturnValue('https://test.logo')

    const userDto = await userService.getMe(authInfo)

    expect(em.findOneOrFail).toBeCalledTimes(1)
    expect(em.findOneOrFail).toBeCalledWith(User, { id: '11' })
    expect(userDto.messageDeliveryType).toBe(MessageDeliveryType.WebSocket)
    expect(userDto.webHook).toBeUndefined()
    expect(userDto.backgroundColor).toBe('#F58529')
    expect(userDto.name).toBe('Cameron')
    expect(userDto.logo).toBe('https://test.logo')
  })

  describe('patchMe', () => {
    test('updates user name, backgroundColor, and sets registeredAt', async () => {
      const user = new User({ id: '11', backgroundColor: '#000', name: 'Old' })
      vi.mocked(em.findOneOrFail).mockResolvedValue(user)
      vi.mocked(fileStorageService.url).mockReturnValue('https://logo.png')

      const result = await userService.patchMe(authInfo, tenantAgent, {
        name: 'NewName',
        backgroundColor: '#fff',
      })

      expect(em.findOneOrFail).toHaveBeenCalledWith(User, { id: '11' })
      expect(user.name).toBe('NewName')
      expect(user.backgroundColor).toBe('#fff')
      expect(user.registeredAt).toBeInstanceOf(Date)
      expect(em.flush).toHaveBeenCalled()
      expect(issuerService.applyUserDisplay).toHaveBeenCalledWith(
        tenantAgent,
        expect.objectContaining({
          name: 'NewName',
          background_color: '#fff',
        }),
      )
      expect(result.name).toBe('NewName')
    })

    test('updates messageDeliveryType and webHook', async () => {
      const user = new User({ id: '11' })
      vi.mocked(em.findOneOrFail).mockResolvedValue(user)

      await userService.patchMe(authInfo, tenantAgent, {
        messageDeliveryType: MessageDeliveryType.WebHook,
        webHook: 'https://hooks.example.com',
      })

      expect(em.findOneOrFail).toHaveBeenCalledWith(User, { id: '11' })
      expect(user.messageDeliveryType).toBe(MessageDeliveryType.WebHook)
      expect(user.webHook).toBe('https://hooks.example.com')
    })

    test('uploads new logo and removes old one', async () => {
      const user = new User({ id: '11', logo: 'old/path.png' })
      vi.mocked(em.findOneOrFail).mockResolvedValue(user)
      vi.mocked(fileStorageService.put).mockResolvedValue('new/path.png')
      vi.mocked(fileStorageService.url).mockReturnValue('https://cdn/new.png')

      const logoFile = { originalname: 'logo.png' } as Express.Multer.File

      const result = await userService.patchMe(authInfo, tenantAgent, {}, logoFile)

      expect(em.findOneOrFail).toHaveBeenCalledWith(User, { id: '11' })
      expect(fileStorageService.remove).toHaveBeenCalledWith('old/path.png')
      expect(fileStorageService.put).toHaveBeenCalledWith(logoFile, expect.objectContaining({ replace: true }))
      expect(user.logo).toBe('new/path.png')
      expect(result.logo).toBe('https://cdn/new.png')
    })

    test('does not overwrite logo when req.logo is empty string', async () => {
      const user = new User({ id: '11', logo: 'some/path.png' })
      vi.mocked(em.findOneOrFail).mockResolvedValue(user)

      await userService.patchMe(authInfo, tenantAgent, { logo: '' })

      expect(em.findOneOrFail).toHaveBeenCalledWith(User, { id: '11' })
      expect(user.logo).toBe('some/path.png')
      expect(em.flush).toHaveBeenCalled()
    })

    test('does not set registeredAt when already set', async () => {
      const existingDate = new Date('2025-01-01')
      const user = new User({ id: '11' })
      user.registeredAt = existingDate
      vi.mocked(em.findOneOrFail).mockResolvedValue(user)

      await userService.patchMe(authInfo, tenantAgent, { name: 'Updated' })

      expect(em.findOneOrFail).toHaveBeenCalledWith(User, { id: '11' })
      expect(user.registeredAt).toBe(existingDate)
    })
  })
})
