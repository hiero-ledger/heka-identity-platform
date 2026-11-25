import { beforeEach, describe, expect, it, vi } from 'vitest'

import { typeMetadataResolver } from '../type-metadata-policy'

const vct = 'https://types.example/vct/Membership'
const document = { vct, name: 'Membership' }

describe('typeMetadataResolver', () => {
  const granted = new Set<string>()
  const defaultResolver = vi.fn()
  const resolve = (value: string, integrity: string | undefined, isExtendedVct = false) =>
    typeMetadataResolver(value, integrity, { isExtendedVct, defaultResolver })

  beforeEach(() => {
    granted.clear()
    defaultResolver.mockReset().mockResolvedValue(document)
    vi.stubGlobal('chrome', {
      permissions: {
        contains: async ({ origins }: { origins: string[] }) => origins.every((origin) => granted.has(origin)),
      },
    })
  })

  it('fetches an https vct pinned by integrity on an origin the holder allowed', async () => {
    granted.add('https://types.example/*')
    await expect(resolve(vct, 'sha256-abc')).resolves.toEqual(document)
    expect(defaultResolver).toHaveBeenCalledTimes(1)
  })

  it('receives a credential without type metadata otherwise', async () => {
    granted.add('https://types.example/*')
    await expect(resolve(vct, undefined)).resolves.toBeUndefined()
    await expect(resolve('GitHub Contributor', 'sha256-abc')).resolves.toBeUndefined()
    await expect(resolve('http://types.example/vct/Membership', 'sha256-abc')).resolves.toBeUndefined()
    granted.clear()
    await expect(resolve(vct, 'sha256-abc')).resolves.toBeUndefined()
    expect(defaultResolver).not.toHaveBeenCalled()
  })

  it('refuses an extended type it does not fetch, with the reason', async () => {
    await expect(resolve(vct, undefined, true)).rejects.toThrow(
      'Type metadata of https://types.example/vct/Membership is not fetched: no integrity.',
    )
    await expect(resolve(vct, 'sha256-abc', true)).rejects.toThrow('no permission for https://types.example.')
    await expect(resolve('urn:types:membership', 'sha256-abc', true)).rejects.toThrow('it is not an https URL.')
    expect(defaultResolver).not.toHaveBeenCalled()
  })
})
