import type { EntityManager } from '@mikro-orm/core'

import type { ConfigService } from '../../src/core/config'
import { UserRole } from '../../src/core/database/entities/user.entity'
import { AdminBootstrapService } from '../../src/user/admin-bootstrap.service'

const { hashPassword } = vi.hoisted(() => ({ hashPassword: vi.fn() }))

vi.mock('../../src/common/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/common/utils')>()
  return { ...actual, hashPassword }
})

describe('AdminBootstrapService', () => {
  let em: {
    count: ReturnType<typeof vi.fn>
    findOne: ReturnType<typeof vi.fn>
    persist: ReturnType<typeof vi.fn>
    flush: ReturnType<typeof vi.fn>
  }

  const createService = (appConfig: { adminName?: string; adminPassword?: string }) =>
    new AdminBootstrapService({ appConfig } as unknown as ConfigService, { fork: () => em } as unknown as EntityManager)

  beforeEach(() => {
    hashPassword.mockResolvedValue('hashed-password')
    em = {
      count: vi.fn().mockResolvedValue(0),
      findOne: vi.fn().mockResolvedValue(null),
      persist: vi.fn(),
      flush: vi.fn(),
    }
  })

  it('creates the first Admin when none exists', async () => {
    await createService({ adminName: 'root', adminPassword: 'Password1234!' }).onApplicationBootstrap()

    expect(hashPassword).toHaveBeenCalledWith('Password1234!')
    expect(em.persist).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'root', password: 'hashed-password', role: UserRole.Admin }),
    )
    expect(em.flush).toHaveBeenCalled()
  })

  it.each([{}, { adminName: 'root' }, { adminPassword: 'Password1234!' }])(
    'does nothing unless both name and password are configured (%o)',
    async (appConfig) => {
      await createService(appConfig).onApplicationBootstrap()

      expect(em.count).not.toHaveBeenCalled()
      expect(em.persist).not.toHaveBeenCalled()
    },
  )

  it('does nothing when an Admin already exists', async () => {
    em.count.mockResolvedValue(1)

    await createService({ adminName: 'root', adminPassword: 'Password1234!' }).onApplicationBootstrap()

    expect(em.persist).not.toHaveBeenCalled()
  })

  it('never promotes an existing user with the configured name', async () => {
    const existingUser = { name: 'root', role: UserRole.User }
    em.findOne.mockResolvedValue(existingUser)

    await createService({ adminName: 'root', adminPassword: 'Password1234!' }).onApplicationBootstrap()

    expect(existingUser.role).toBe(UserRole.User)
    expect(em.persist).not.toHaveBeenCalled()
  })
})
