import crypto from 'react-native-quick-crypto'

const PBKDF2_OPTIONS = {
  salt: new Uint8Array(),
  iterations: 100000,
  keyLength: 256,
}

export function generatePbkdf2Key(password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const { salt, iterations, keyLength } = PBKDF2_OPTIONS

    crypto.pbkdf2(password, salt, iterations, keyLength, (err, derivedKey) => {
      if (err || !derivedKey) {
        const error = err ?? new Error('Unknown error')
        console.error('Error on generating PBKDF2 key', error)
        reject(error)
        return
      }

      resolve(derivedKey.toString('hex'))
    })
  })
}
