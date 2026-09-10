import { createMock } from '@golevelup/ts-vitest'
import { NotFoundException } from '@nestjs/common'

import { Logger } from 'common/logger'

import { TrustListService } from '../trust-list.service'
import { VicalController } from '../vical.controller'

describe('VicalController', () => {
  const build = (enabled: boolean) => {
    const trustListService = createMock<TrustListService>({
      enabled,
      getVical: vi.fn().mockResolvedValue(new Uint8Array([0xd2, 0x84])),
    })
    return { trustListService, controller: new VicalController(trustListService, createMock<Logger>()) }
  }

  test('answers 404 while VICAL publication is disabled and never builds the list', async () => {
    const { controller, trustListService } = build(false)

    await expect(controller.getVical()).rejects.toBeInstanceOf(NotFoundException)
    expect(trustListService.getVical).not.toHaveBeenCalled()
  })

  test('serves the signed VICAL bytes when enabled', async () => {
    const { controller, trustListService } = build(true)

    const body = await controller.getVical()

    expect(Buffer.isBuffer(body)).toBe(true)
    expect([...body]).toEqual([0xd2, 0x84])
    expect(trustListService.getVical).toHaveBeenCalledTimes(1)
  })
})
