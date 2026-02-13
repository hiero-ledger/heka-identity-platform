export type BundleIndexEntry = {
  path: string
  sha256: string
}

export type BundleIndex = {
  [key: string]: BundleIndexEntry
}
