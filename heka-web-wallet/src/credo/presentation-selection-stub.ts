const DCQL_ONLY = 'Presentation Exchange is not supported. This wallet accepts DCQL requests only.'

export function extractPresentationsWithDescriptorsFromSubmission(): never {
  throw new Error(DCQL_ONLY)
}
