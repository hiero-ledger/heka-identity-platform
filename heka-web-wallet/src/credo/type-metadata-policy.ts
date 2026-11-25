import type { SdJwtVcModule } from '@credo-ts/core'

import { grantableOrigin, originPattern } from '../wallet/host-access'

type TypeMetadataResolver = NonNullable<
  NonNullable<ConstructorParameters<typeof SdJwtVcModule>[0]>['customTypeMetadataResolver']
>

/** Why the wallet does not fetch the type metadata of `vct`, or null when it does. */
async function refusalReason(vct: string, integrity: string | undefined): Promise<string | null> {
  let origin: string
  try {
    const url = new URL(vct)
    if (url.protocol !== 'https:') return 'it is not an https URL'
    // The host rule of every grant: a host no match pattern can name is never checked.
    const grantable = grantableOrigin(vct)
    if (!grantable) return 'its host cannot be allowed'
    origin = grantable
  } catch {
    return 'it is not an https URL'
  }
  if (!integrity) return 'no integrity'
  const allowed = await chrome.permissions.contains({ origins: [originPattern(origin)] })
  return allowed ? null : `no permission for ${origin}`
}

/**
 * Fetches SD-JWT VC type metadata only when the credential pins the document (`vct#integrity`) on
 * an https origin the holder already allowed. Otherwise a credential is received without type
 * metadata, and one that extends another type is refused: Credo needs the extended document.
 */
export const typeMetadataResolver: TypeMetadataResolver = async (vct, integrity, options) => {
  const reason = await refusalReason(vct, integrity)
  if (!reason) return options.defaultResolver({})
  if (options.isExtendedVct) throw new Error(`Type metadata of ${vct} is not fetched: ${reason}.`)
  return undefined
}
