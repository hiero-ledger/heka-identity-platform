export const testDbHost = process.env.MIKRO_ORM_HOST || 'localhost'
export const testDbPort = process.env.MIKRO_ORM_PORT ? parseInt(process.env.MIKRO_ORM_PORT, 10) : 5432
export const testDbUser = process.env.MIKRO_ORM_USER || 'heka'
export const testDbPassword = process.env.MIKRO_ORM_PASSWORD || 'heka1'
