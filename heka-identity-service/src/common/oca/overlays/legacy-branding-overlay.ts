import { Expose } from 'class-transformer'

import { BaseOverlay, IBaseOverlayData } from './base-overlay'
import { OverlayType } from './consts'

// Todo: Need to check classes on correct working and correct seializing to JSON with snake_case
//       Will be good to write unit-tests

export interface ILegacyBrandingOverlayData extends IBaseOverlayData {
  backgroundColor?: string
  imageSource?: string
  header?: {
    color?: string
    backgroundColor?: string
    imageSource?: string
    hideIssuer?: boolean
  }
  footer?: {
    color?: string
    backgroundColor?: string
  }
}

export class LegacyBrandingOverlayHeader {
  @Expose({ name: 'color' })
  public color?: string

  @Expose({ name: 'background_color' })
  public backgroundColor?: string

  @Expose({ name: 'image_source' })
  public imageSource?: string

  @Expose({ name: 'hide_issuer' })
  public hideIssuer?: boolean
}

export class LegacyBrandingOverlayFooter {
  @Expose({ name: 'color' })
  public color?: string

  @Expose({ name: 'background_color' })
  public backgroundColor?: string
}

export class LegacyBrandingOverlay extends BaseOverlay implements ILegacyBrandingOverlayData {
  @Expose({ name: 'background_color' })
  public backgroundColor?: string

  @Expose({ name: 'image_source' })
  public imageSource?: string

  @Expose({ name: 'header' })
  public header?: LegacyBrandingOverlayHeader

  @Expose({ name: 'footer' })
  public footer?: LegacyBrandingOverlayFooter

  public constructor(partial?: Partial<Omit<LegacyBrandingOverlay, 'type'>>) {
    super(partial)
    Object.assign(this, partial)
    this.type = OverlayType.LegacyBrandingOverlay
  }
}
