const DCQL_ONLY = 'Presentation Exchange is not supported. This wallet accepts DCQL requests only.'

export function getCredentialsForRequest(): Promise<never> {
  return Promise.reject(new Error(DCQL_ONLY))
}
