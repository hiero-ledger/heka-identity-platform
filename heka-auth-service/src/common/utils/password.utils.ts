import { hash, verify } from 'argon2'

export const hashPassword = (userPassword: string): Promise<string> => hash(userPassword)

export const verifyPassword = (userPassword: string, passwordToCompare: string): Promise<boolean> =>
  verify(userPassword, passwordToCompare)
