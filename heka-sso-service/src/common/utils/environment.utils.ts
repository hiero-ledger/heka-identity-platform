export const isDev = !process.env.NODE_ENV || process.env.NODE_ENV?.toLowerCase() === 'development'
export const isProd = process.env.NODE_ENV?.toLowerCase() === 'production'
export const isTest = process.env.NODE_ENV?.toLowerCase() === 'test'
