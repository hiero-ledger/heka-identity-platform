export const SecondsToDate = (seconds: number) => {
  return new Date(new Date(0).setSeconds(seconds))
}

export const ExpiresInToDate = (expiresIn: number) => {
  const expiration = new Date()
  expiration.setTime(expiration.getTime() + 1000 * expiresIn)
  return expiration
}
