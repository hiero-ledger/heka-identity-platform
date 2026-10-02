import { createMock } from '@golevelup/ts-vitest'
import { EntityManager } from '@mikro-orm/core'

import { TenantAgent } from 'common/agent'
import { Role } from 'common/auth'
import { MessageDeliveryType, User, Wallet } from 'common/entities'
import { Logger } from 'common/logger'
import { WebhookEgressService, WebhookTargetPolicyError } from 'common/webhook'
import { OpenId4VcIssuerService } from 'openid4vc/issuer/issuer.service'

import { FileStorageService } from '../../common/file-storage/file-storage.service'
import { UserService } from '../user.service'

describe('UserService', () => {
  let em: EntityManager
  let logger: Logger
  let userService: UserService
  let issuerService: OpenId4VcIssuerService
  let fileStorageService: FileStorageService
  let webhookEgress: WebhookEgressService
  let tenantAgent: TenantAgent

  const authInfo = {
    userId: '11',
    user: { id: '11' } as User,
    userName: 'test',
    role: Role.Issuer,
    orgId: '7',
    walletId: 'Member_11_in_Organization_7',
    tenantId: '123',
  }

  beforeEach(() => {
    em = createMock<EntityManager>()
    logger = createMock<Logger>()
    issuerService = createMock<OpenId4VcIssuerService>()
    fileStorageService = createMock<FileStorageService>()
    webhookEgress = createMock<WebhookEgressService>()
    vi.mocked(webhookEgress.assertCallbackUrlAllowed).mockResolvedValue(undefined)
    userService = new UserService(em, logger, issuerService, fileStorageService, webhookEgress)
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
      const user = new User({ id: '11', backgroundColor: '#000', name: 'Old', logo: 'users_logo/old.png' })
      vi.mocked(em.findOneOrFail).mockResolvedValue(user)
      vi.mocked(fileStorageService.publicUrl).mockReturnValue('https://logo.png')

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
          // OID4VCI draft 13+ key — wallets ignore `url` and reject non-https values
          logo: { uri: 'https://logo.png' },
        }),
      )
      expect(fileStorageService.publicUrl).toHaveBeenCalledWith('users_logo/old.png')
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
      expect(webhookEgress.assertCallbackUrlAllowed).toHaveBeenCalledWith('https://hooks.example.com')
      expect(issuerService.applyUserDisplay).not.toHaveBeenCalled()
    })

    test('rejects a webHook that violates the egress policy and persists nothing', async () => {
      const user = new User({ id: '11' })
      vi.mocked(em.findOneOrFail).mockResolvedValue(user)
      vi.mocked(webhookEgress.assertCallbackUrlAllowed).mockRejectedValue(
        new WebhookTargetPolicyError('HOST', 'Webhook hostname is not permitted'),
      )

      await expect(
        userService.patchMe(authInfo, tenantAgent, {
          messageDeliveryType: MessageDeliveryType.WebHook,
          webHook: 'http://metadata.google.internal/hook',
        }),
      ).rejects.toMatchObject({ status: 400, message: 'Webhook hostname is not permitted' })

      expect(user.webHook).toBeUndefined()
      expect(em.flush).not.toHaveBeenCalled()
    })

    test('rejects a disallowed webHook before touching the logo', async () => {
      const user = new User({ id: '11', logo: 'old/path.png', messageDeliveryType: MessageDeliveryType.WebSocket })
      vi.mocked(em.findOneOrFail).mockResolvedValue(user)
      vi.mocked(webhookEgress.assertCallbackUrlAllowed).mockRejectedValue(
        new WebhookTargetPolicyError('ADDR', 'Webhook target address is not permitted'),
      )
      const logoFile = { originalname: 'logo.png' } as Express.Multer.File

      await expect(
        userService.patchMe(
          authInfo,
          tenantAgent,
          { messageDeliveryType: MessageDeliveryType.WebHook, webHook: 'https://blocked.example.com' },
          logoFile,
        ),
      ).rejects.toMatchObject({ status: 400, message: 'Webhook target address is not permitted' })

      expect(fileStorageService.remove).not.toHaveBeenCalled()
      expect(fileStorageService.put).not.toHaveBeenCalled()
      expect(user.logo).toBe('old/path.png')
      expect(user.messageDeliveryType).toBe(MessageDeliveryType.WebSocket)
      expect(user.webHook).toBeUndefined()
      expect(issuerService.applyUserDisplay).not.toHaveBeenCalled()
      expect(em.flush).not.toHaveBeenCalled()
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

  describe('issuer display belongs to the wallet', () => {
    const mockEntities = (user: User, wallet: Wallet) =>
      vi
        .mocked(em.findOneOrFail)
        .mockImplementation(((entity: unknown) => Promise.resolve(entity === Wallet ? wallet : user)) as never)

    test('an actor who administers the wallet writes the display and the wallet display name', async () => {
      const user = new User({ id: '11' })
      const wallet = new Wallet({ id: 'Member_11_in_Organization_7', tenantId: '123' })
      mockEntities(user, wallet)

      await userService.patchMe(authInfo, tenantAgent, { name: 'Alice' })

      expect(issuerService.applyUserDisplay).toHaveBeenCalledWith(
        tenantAgent,
        expect.objectContaining({ name: 'Alice' }),
      )
      expect(wallet.displayName).toBe('Alice')
    })

    test('an OrgManager updates only their own profile, not the organization display', async () => {
      const user = new User({ id: '11' })
      const wallet = new Wallet({ id: 'Organization_7', tenantId: '123' })
      wallet.displayName = 'Org'
      mockEntities(user, wallet)

      await userService.patchMe({ ...authInfo, role: Role.OrgManager, walletId: 'Organization_7' }, tenantAgent, {
        name: 'Bob',
      })

      expect(user.name).toBe('Bob')
      expect(issuerService.applyUserDisplay).not.toHaveBeenCalled()
      expect(wallet.displayName).toBe('Org')
    })

    const adminAuthInfo = { ...authInfo, role: Role.Admin, orgId: undefined, walletId: 'Administration' }

    test('a patch without display fields does not change the shared display', async () => {
      const user = new User({ id: '11', name: 'Second admin', backgroundColor: '#123', logo: 'admin/logo.png' })
      const wallet = new Wallet({ id: 'Administration', tenantId: '123' })
      wallet.displayName = 'Platform'
      mockEntities(user, wallet)

      await userService.patchMe(adminAuthInfo, tenantAgent, {
        webHook: 'https://hooks.example.com',
        messageDeliveryType: MessageDeliveryType.WebHook,
      })

      expect(user.webHook).toBe('https://hooks.example.com')
      expect(issuerService.applyUserDisplay).not.toHaveBeenCalled()
      expect(wallet.displayName).toBe('Platform')
      expect(em.flush).toHaveBeenCalled()
    })

    test('resetting the logo is a display change', async () => {
      const user = new User({ id: '11', name: 'Alice', logo: 'some/path.png' })
      const wallet = new Wallet({ id: 'Administration', tenantId: '123' })
      mockEntities(user, wallet)

      await userService.patchMe(adminAuthInfo, tenantAgent, { logo: '' })

      expect(issuerService.applyUserDisplay).toHaveBeenCalledWith(
        tenantAgent,
        expect.objectContaining({ name: 'Alice', logo: { uri: undefined } }),
      )
      expect(wallet.displayName).toBe('Alice')
    })

    test('an uploaded logo alone is a display change', async () => {
      const user = new User({ id: '11', name: 'Alice' })
      const wallet = new Wallet({ id: 'Administration', tenantId: '123' })
      mockEntities(user, wallet)
      vi.mocked(fileStorageService.put).mockResolvedValue('new/path.png')
      vi.mocked(fileStorageService.publicUrl).mockReturnValue('https://cdn/new.png')

      await userService.patchMe(adminAuthInfo, tenantAgent, {}, { originalname: 'logo.png' } as Express.Multer.File)

      expect(issuerService.applyUserDisplay).toHaveBeenCalledWith(
        tenantAgent,
        expect.objectContaining({ name: 'Alice', logo: { uri: 'https://cdn/new.png' } }),
      )
      expect(wallet.displayName).toBe('Alice')
    })
  })
})
