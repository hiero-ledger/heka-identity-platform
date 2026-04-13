import { createMock } from '@golevelup/ts-vitest'
import { InternalServerErrorException } from '@nestjs/common'
import { when } from 'vitest-when'

import { TenantAgent } from 'common/agent'
import { Role } from 'common/auth'
import { UserService } from 'user/user.service'

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
        { id: 'conn-1', state: 'completed', role: 'requester', createdAt: new Date() },
        { id: 'conn-2', state: 'request-sent', role: 'responder', createdAt: new Date() },
      ]
      when(tenantAgent.didcomm.connections.getAll).calledWith().thenResolve(mockRecords as any)

      const result = await connectionService.find(tenantAgent)

      expect(result).toHaveLength(2)
      expect(result[0].id).toBe('conn-1')
      expect(result[1].id).toBe('conn-2')
    })

    test('returns empty array when no connections', async () => {
      when(tenantAgent.didcomm.connections.getAll).calledWith().thenResolve([])

      const result = await connectionService.find(tenantAgent)

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
      when(userService.getMe).calledWith(authInfo).thenResolve({
        name: 'Alice',
        logo: 'https://logo.png',
      } as any)

      const mockOobRecord = {
        id: 'oob-1',
        outOfBandInvitation: {
          toUrl: vi.fn().mockReturnValue('https://example.com/invite?oob=abc'),
        },
      }
      when(tenantAgent.didcomm.oob.createInvitation)
        .calledWith(
          expect.objectContaining({
            label: 'Custom Label',
            alias: 'my-alias',
            imageUrl: 'https://custom.png',
            multiUseInvitation: true,
          }),
        )
        .thenResolve(mockOobRecord as any)

      const mockDidcommConfig = { endpoints: ['https://endpoint.com'] }
      when(tenantAgent.dependencyManager.resolve).calledWith(expect.anything()).thenReturn(mockDidcommConfig)

      const result = await connectionService.createInvitation(authInfo, tenantAgent, {
        label: 'Custom Label',
        alias: 'my-alias',
        imageUrl: 'https://custom.png',
        multiUseInvitation: true,
      })

      expect(result.id).toBe('oob-1')
      expect(result.invitationUrl).toBe('https://example.com/invite?oob=abc')
    })

    test('falls back to user name and logo when not provided in request', async () => {
      when(userService.getMe).calledWith(authInfo).thenResolve({
        name: 'Alice',
        logo: 'https://alice-logo.png',
      } as any)

      const mockOobRecord = {
        id: 'oob-2',
        outOfBandInvitation: {
          toUrl: vi.fn().mockReturnValue('https://example.com/invite'),
        },
      }
      when(tenantAgent.didcomm.oob.createInvitation)
        .calledWith(
          expect.objectContaining({
            label: 'Alice',
            imageUrl: 'https://alice-logo.png',
          }),
        )
        .thenResolve(mockOobRecord as any)

      const mockDidcommConfig = { endpoints: ['https://endpoint.com'] }
      when(tenantAgent.dependencyManager.resolve).calledWith(expect.anything()).thenReturn(mockDidcommConfig)

      const result = await connectionService.createInvitation(authInfo, tenantAgent, {})

      expect(result.id).toBe('oob-2')
    })
  })

  describe('acceptInvitation', () => {
    test('accepts invitation and returns connection record', async () => {
      const mockConnectionRecord = {
        id: 'conn-1',
        state: 'request-sent',
        role: 'requester',
        createdAt: new Date(),
      }
      when(tenantAgent.didcomm.oob.receiveInvitationFromUrl)
        .calledWith(
          'https://example.com/invite',
          expect.objectContaining({ label: 'Connection', alias: undefined }),
        )
        .thenResolve({ connectionRecord: mockConnectionRecord } as any)

      const result = await connectionService.acceptInvitation(tenantAgent, {
        invitationUrl: 'https://example.com/invite',
      })

      expect(result.id).toBe('conn-1')
    })

    test('uses custom label and alias when provided', async () => {
      const mockConnectionRecord = { id: 'conn-2', state: 'request-sent', role: 'requester', createdAt: new Date() }
      when(tenantAgent.didcomm.oob.receiveInvitationFromUrl)
        .calledWith(
          'https://example.com/invite',
          expect.objectContaining({ label: 'My Label', alias: 'my-alias' }),
        )
        .thenResolve({ connectionRecord: mockConnectionRecord } as any)

      const result = await connectionService.acceptInvitation(tenantAgent, {
        invitationUrl: 'https://example.com/invite',
        label: 'My Label',
        alias: 'my-alias',
      })

      expect(result.id).toBe('conn-2')
    })

    test('throws InternalServerErrorException when connectionRecord is undefined', async () => {
      when(tenantAgent.didcomm.oob.receiveInvitationFromUrl)
        .calledWith('https://example.com/invite', expect.anything())
        .thenResolve({ connectionRecord: undefined } as any)

      await expect(
        connectionService.acceptInvitation(tenantAgent, { invitationUrl: 'https://example.com/invite' }),
      ).rejects.toThrow(InternalServerErrorException)
    })
  })

  describe('get', () => {
    test('returns connection when found by ID', async () => {
      const mockRecord = { id: 'conn-1', state: 'completed', role: 'requester', createdAt: new Date() }
      when(tenantAgent.didcomm.connections.findById).calledWith('conn-1').thenResolve(mockRecord as any)

      const result = await connectionService.get(tenantAgent, 'conn-1')

      expect(result).not.toBeNull()
      expect(result!.id).toBe('conn-1')
    })

    test('falls back to out-of-band ID lookup when not found by direct ID', async () => {
      when(tenantAgent.didcomm.connections.findById).calledWith('oob-1').thenResolve(null as any)

      const mockRecord = { id: 'conn-from-oob', state: 'completed', role: 'requester', createdAt: new Date() }
      when(tenantAgent.didcomm.connections.findAllByOutOfBandId)
        .calledWith('oob-1')
        .thenResolve([mockRecord as any])

      const result = await connectionService.get(tenantAgent, 'oob-1')

      expect(result).not.toBeNull()
      expect(result!.id).toBe('conn-from-oob')
    })

    test('returns null when connection not found by either ID or OOB ID', async () => {
      when(tenantAgent.didcomm.connections.findById).calledWith('unknown').thenResolve(null as any)
      when(tenantAgent.didcomm.connections.findAllByOutOfBandId).calledWith('unknown').thenResolve([])

      const result = await connectionService.get(tenantAgent, 'unknown')

      expect(result).toBeNull()
    })
  })
})
