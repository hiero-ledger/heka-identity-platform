import { createMock } from '@golevelup/ts-vitest'
import { InternalServerErrorException } from '@nestjs/common'

import { TenantAgent } from 'common/agent'
import { Role } from 'common/auth'
import { UserService } from 'user/user.service'

import { connectionRecordStub, oobRecordStub } from '../../../test/helpers/mock-records'
import { ConnectionService } from '../connection.service'

describe('ConnectionService', () => {
  let connectionService: ConnectionService
  let userService: UserService
  let tenantAgent: TenantAgent

  beforeEach(() => {
    userService = createMock<UserService>()
    connectionService = new ConnectionService(userService)
    tenantAgent = createMock<TenantAgent>({
      didcomm: {
        connections: { getAll: vi.fn(), findById: vi.fn(), findAllByOutOfBandId: vi.fn() },
        oob: { createInvitation: vi.fn(), receiveInvitationFromUrl: vi.fn() },
      } as any,
      dependencyManager: { resolve: vi.fn() } as any,
    })
  })

  describe('find', () => {
    test('returns all connection records', async () => {
      const mockRecords = [
        connectionRecordStub({ id: 'conn-1', state: 'completed', role: 'requester', createdAt: new Date() }),
        connectionRecordStub({
          id: 'conn-2',
          state: 'request-sent',
          role: 'responder',
          createdAt: new Date(),
        }),
      ]
      vi.mocked(tenantAgent.didcomm.connections.getAll).mockResolvedValue(mockRecords)

      const result = await connectionService.find(tenantAgent)

      expect(tenantAgent.didcomm.connections.getAll).toHaveBeenCalledWith()
      expect(result).toHaveLength(2)
      expect(result[0].id).toBe('conn-1')
      expect(result[1].id).toBe('conn-2')
    })

    test('returns empty array when no connections', async () => {
      vi.mocked(tenantAgent.didcomm.connections.getAll).mockResolvedValue([])

      const result = await connectionService.find(tenantAgent)

      expect(tenantAgent.didcomm.connections.getAll).toHaveBeenCalledWith()
      expect(result).toHaveLength(0)
    })
  })

  describe('createInvitation', () => {
    const authInfo = {
      userId: 'user-1',
      user: { id: 'user-1' } as any,
      userName: 'testuser',
      role: Role.Issuer,
      orgId: '1',
      walletId: 'Issuer_user-1_in_Organization_1',
      tenantId: 'tenant-1',
    }

    test('creates invitation with request label and imageUrl', async () => {
      vi.mocked(userService.getMe).mockResolvedValue({ name: 'Alice', logo: 'https://logo.png' } as any)

      const mockOobRecord = oobRecordStub({
        id: 'oob-1',
        outOfBandInvitation: {
          toUrl: vi.fn().mockReturnValue('https://example.com/invite?oob=abc'),
        },
      })
      vi.mocked(tenantAgent.didcomm.oob.createInvitation).mockResolvedValue(mockOobRecord)

      const mockDidcommConfig = { endpoints: ['https://endpoint.com'] }
      vi.mocked(tenantAgent.dependencyManager.resolve).mockReturnValue(mockDidcommConfig)

      const result = await connectionService.createInvitation(authInfo, tenantAgent, {
        label: 'Custom Label',
        alias: 'my-alias',
        imageUrl: 'https://custom.png',
        multiUseInvitation: true,
      })

      expect(userService.getMe).toHaveBeenCalledWith(authInfo)
      expect(tenantAgent.didcomm.oob.createInvitation).toHaveBeenCalledWith(
        expect.objectContaining({
          label: 'Custom Label',
          alias: 'my-alias',
          imageUrl: 'https://custom.png',
          multiUseInvitation: true,
        }),
      )
      expect(result.id).toBe('oob-1')
      expect(result.invitationUrl).toBe('https://example.com/invite?oob=abc')
    })

    test('falls back to user name and logo when not provided in request', async () => {
      vi.mocked(userService.getMe).mockResolvedValue({ name: 'Alice', logo: 'https://alice-logo.png' } as any)

      const mockOobRecord = oobRecordStub({
        id: 'oob-2',
        outOfBandInvitation: {
          toUrl: vi.fn().mockReturnValue('https://example.com/invite'),
        },
      })
      vi.mocked(tenantAgent.didcomm.oob.createInvitation).mockResolvedValue(mockOobRecord)

      const mockDidcommConfig = { endpoints: ['https://endpoint.com'] }
      vi.mocked(tenantAgent.dependencyManager.resolve).mockReturnValue(mockDidcommConfig)

      const result = await connectionService.createInvitation(authInfo, tenantAgent, {})

      expect(userService.getMe).toHaveBeenCalledWith(authInfo)
      expect(tenantAgent.didcomm.oob.createInvitation).toHaveBeenCalledWith(
        expect.objectContaining({ label: 'Alice', imageUrl: 'https://alice-logo.png' }),
      )
      expect(result.id).toBe('oob-2')
    })
  })

  describe('acceptInvitation', () => {
    test('accepts invitation and returns connection record', async () => {
      const mockConnectionRecord = connectionRecordStub({
        id: 'conn-1',
        state: 'request-sent',
        role: 'requester',
        createdAt: new Date(),
      })
      vi.mocked(tenantAgent.didcomm.oob.receiveInvitationFromUrl).mockResolvedValue({
        connectionRecord: mockConnectionRecord,
      } as any)

      const result = await connectionService.acceptInvitation(tenantAgent, {
        invitationUrl: 'https://example.com/invite',
      })

      expect(tenantAgent.didcomm.oob.receiveInvitationFromUrl).toHaveBeenCalledWith(
        'https://example.com/invite',
        expect.objectContaining({ label: 'Connection', alias: undefined }),
      )
      expect(result.id).toBe('conn-1')
    })

    test('uses custom label and alias when provided', async () => {
      const mockConnectionRecord = connectionRecordStub({
        id: 'conn-2',
        state: 'request-sent',
        role: 'requester',
        createdAt: new Date(),
      })
      vi.mocked(tenantAgent.didcomm.oob.receiveInvitationFromUrl).mockResolvedValue({
        connectionRecord: mockConnectionRecord,
      } as any)

      const result = await connectionService.acceptInvitation(tenantAgent, {
        invitationUrl: 'https://example.com/invite',
        label: 'My Label',
        alias: 'my-alias',
      })

      expect(tenantAgent.didcomm.oob.receiveInvitationFromUrl).toHaveBeenCalledWith(
        'https://example.com/invite',
        expect.objectContaining({ label: 'My Label', alias: 'my-alias' }),
      )
      expect(result.id).toBe('conn-2')
    })

    test('throws InternalServerErrorException when connectionRecord is undefined', async () => {
      vi.mocked(tenantAgent.didcomm.oob.receiveInvitationFromUrl).mockResolvedValue({
        connectionRecord: undefined,
      } as any)

      await expect(
        connectionService.acceptInvitation(tenantAgent, { invitationUrl: 'https://example.com/invite' }),
      ).rejects.toThrow(InternalServerErrorException)
    })
  })

  describe('get', () => {
    test('returns connection when found by ID', async () => {
      const mockRecord = connectionRecordStub({
        id: 'conn-1',
        state: 'completed',
        role: 'requester',
        createdAt: new Date(),
      })
      vi.mocked(tenantAgent.didcomm.connections.findById).mockResolvedValue(mockRecord)

      const result = await connectionService.get(tenantAgent, 'conn-1')

      expect(tenantAgent.didcomm.connections.findById).toHaveBeenCalledWith('conn-1')
      expect(result).not.toBeNull()
      expect(result!.id).toBe('conn-1')
    })

    test('falls back to out-of-band ID lookup when not found by direct ID', async () => {
      vi.mocked(tenantAgent.didcomm.connections.findById).mockResolvedValue(null)

      const mockRecord = connectionRecordStub({
        id: 'conn-from-oob',
        state: 'completed',
        role: 'requester',
        createdAt: new Date(),
      })
      vi.mocked(tenantAgent.didcomm.connections.findAllByOutOfBandId).mockResolvedValue([mockRecord])

      const result = await connectionService.get(tenantAgent, 'oob-1')

      expect(tenantAgent.didcomm.connections.findById).toHaveBeenCalledWith('oob-1')
      expect(tenantAgent.didcomm.connections.findAllByOutOfBandId).toHaveBeenCalledWith('oob-1')
      expect(result).not.toBeNull()
      expect(result!.id).toBe('conn-from-oob')
    })

    test('returns null when connection not found by either ID or OOB ID', async () => {
      vi.mocked(tenantAgent.didcomm.connections.findById).mockResolvedValue(null)
      vi.mocked(tenantAgent.didcomm.connections.findAllByOutOfBandId).mockResolvedValue([])

      const result = await connectionService.get(tenantAgent, 'unknown')

      expect(tenantAgent.didcomm.connections.findById).toHaveBeenCalledWith('unknown')
      expect(tenantAgent.didcomm.connections.findAllByOutOfBandId).toHaveBeenCalledWith('unknown')
      expect(result).toBeNull()
    })
  })
})
