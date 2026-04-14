import { createMock } from '@golevelup/ts-vitest'
import { ConfigType } from '@nestjs/config'

import { Logger } from 'common/logger'
import AgentConfig from 'config/agent'

import { OpenId4VcStarterService } from '../starter.service'

describe('OpenId4VcStarterService', () => {
  let service: OpenId4VcStarterService
  let logger: Logger
  let agencyConfig: ConfigType<typeof AgentConfig>
  let mockServer: { close: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    mockServer = { close: vi.fn() }

    logger = createMock<Logger>({
      child: vi.fn().mockReturnValue({
        trace: vi.fn(),
      }),
    })

    agencyConfig = {
      oidConfig: {
        app: {
          listen: vi.fn().mockReturnValue(mockServer),
        },
        port: 3000,
      },
    } as any

    service = new OpenId4VcStarterService(logger, agencyConfig)
  })

  describe('constructor', () => {
    test('should start listening on the configured port', () => {
      expect(agencyConfig.oidConfig.app.listen).toHaveBeenCalledWith(3000)
    })

    test('should log constructor trace', () => {
      expect(logger.child).toHaveBeenCalledWith('constructor')
    })
  })

  describe('onApplicationShutdown', () => {
    test('should close the server', () => {
      service.onApplicationShutdown()

      expect(mockServer.close).toHaveBeenCalled()
    })
  })
})
