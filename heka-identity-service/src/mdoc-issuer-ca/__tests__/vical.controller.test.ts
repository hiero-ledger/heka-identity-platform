import { createMock } from '@golevelup/ts-vitest'
import { NotFoundException, StreamableFile } from '@nestjs/common'

import { Logger } from 'common/logger'

import { VicalController } from '../vical.controller'
import { VicalService } from '../vical.service'

describe('VicalController', () => {
  const build = (enabled: boolean) => {
    const vicalService = createMock<VicalService>({
      enabled,
      getVical: vi.fn().mockResolvedValue(new Uint8Array([0xd2, 0x84])),
    })
    return { vicalService, controller: new VicalController(vicalService, createMock<Logger>()) }
  }

  test('answers 404 while VICAL publication is disabled and never builds the list', async () => {
    const { controller, vicalService } = build(false)

    await expect(controller.getVical()).rejects.toBeInstanceOf(NotFoundException)
    expect(vicalService.getVical).not.toHaveBeenCalled()
  })

  test('serves the signed VICAL bytes when enabled', async () => {
    const { controller, vicalService } = build(true)

    const body = await controller.getVical()

    expect(body).toBeInstanceOf(StreamableFile)
    expect(body.getHeaders().type).toBe('application/cbor')
    const chunks: Buffer[] = []
    for await (const chunk of body.getStream()) chunks.push(Buffer.from(chunk as Uint8Array))
    expect([...Buffer.concat(chunks)]).toEqual([0xd2, 0x84])
    expect(vicalService.getVical).toHaveBeenCalledTimes(1)
  })
})
