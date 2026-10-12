// IPv4 rather than `localhost`: on Windows `localhost` resolves to `::1` first, and Docker Desktop's IPv6 port forward
// intermittently hangs or resets connections (ECONNRESET, "connection was forcibly closed") under test load
export const testDbHost = process.env.MIKRO_ORM_HOST || '127.0.0.1'
export const testDbPort = process.env.MIKRO_ORM_PORT ? parseInt(process.env.MIKRO_ORM_PORT, 10) : 5432
export const testDbUser = process.env.MIKRO_ORM_USER || 'heka'
export const testDbPassword = process.env.MIKRO_ORM_PASSWORD || 'heka1'
