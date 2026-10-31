export function presentErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : 'Presentation request failed'
  if (message.includes('cannot be satisfied') || message.includes('Cannot auto-select')) {
    return 'No stored credential matches this request. Receive a GitHub contributor credential, then try again.'
  }
  if (message.includes('Key with key id') || message.includes('was not found')) {
    return 'The holder key for this credential is gone. Receive the credential again.'
  }
  return `${message} The request is still saved. Retry when the verifier is reachable.`
}
