import { BaseOverlay } from './base-overlay'
import { BrandingOverlay } from './branding-overlay'
import { CharacterEncodingOverlay } from './charaster-encoding-overlay'
import { OverlayType } from './consts'
import { FormatOverlay } from './format-overlay'
import { InformationOverlay } from './information-overlay'
import { LabelOverlay } from './label-overlay'
import { LegacyBrandingOverlay } from './legacy-branding-overlay'
import { MetaOverlay } from './meta-overlay'
import { StandardOverlay } from './standard-overlay'

export const OverlayTypeMap: Map<string, typeof BaseOverlay | typeof BrandingOverlay | typeof LegacyBrandingOverlay> =
  new Map(
    Object.entries({
      [OverlayType.CharacterEncodingOverlay]: CharacterEncodingOverlay,
      [OverlayType.LabelOverlay]: LabelOverlay,
      [OverlayType.InformationOverlay]: InformationOverlay,
      [OverlayType.FormatOverlay]: FormatOverlay,
      [OverlayType.StandardOverlay]: StandardOverlay,
      [OverlayType.MetaOverlay]: MetaOverlay,
      [OverlayType.BrandingOverlay]: BrandingOverlay,
      [OverlayType.LegacyBrandingOverlay]: LegacyBrandingOverlay,
    }),
  )
