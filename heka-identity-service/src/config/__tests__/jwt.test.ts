describe('jwt config', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
    delete process.env.JWT_SECRET
  })

  afterEach(() => {
    process.env = originalEnv
  })

  test('throws when JWT_SECRET is not set', async () => {
    delete process.env.JWT_SECRET
    await expect(async () => {
      const mod = await import('../jwt')
      mod.default()
    }).rejects.toThrow('JWT_SECRET environment variable is required')
  })

  test('throws when JWT_SECRET is shorter than 32 characters', async () => {
    process.env.JWT_SECRET = 'tooshort'
    await expect(async () => {
      const mod = await import('../jwt')
      mod.default()
    }).rejects.toThrow('JWT_SECRET must be at least 32 characters long')
  })

  test('returns config when JWT_SECRET is 32+ characters', async () => {
    process.env.JWT_SECRET = 'a]3Fj$9kL!mN0pQrStUvWxYz12345678'
    const mod = await import('../jwt')
    const config = mod.default()
    expect(config.secret).toBe('a]3Fj$9kL!mN0pQrStUvWxYz12345678')
  })
})