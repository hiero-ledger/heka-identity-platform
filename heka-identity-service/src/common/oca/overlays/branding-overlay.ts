import { Expose } from 'class-transformer'

import { BaseOverlay, IBaseOverlayData } from './base-overlay'
import { OverlayType } from './consts'

export interface IBrandingOverlayData extends IBaseOverlayData {
  logo?: string
  backgroundImage?: string
  backgroundImageSlice?: string
  primaryBackgroundColor?: string
  secondaryBackgroundColor?: string
  primaryAttribute?: string
  secondaryAttribute?: string
  issuedDateAttribute?: string
  expiryDateAttribute?: string
}

export class BrandingOverlay extends BaseOverlay implements IBrandingOverlayData {
  @Expose({ name: 'logo' })
  public logo?: string

  @Expose({ name: 'background_image' })
  public backgroundImage?: string

  @Expose({ name: 'background_image_slice' })
  public backgroundImageSlice?: string

  @Expose({ name: 'primary_background_color' })
  public primaryBackgroundColor?: string

  @Expose({ name: 'secondary_background_color' })
  public secondaryBackgroundColor?: string

  @Expose({ name: 'primary_attribute' })
  public primaryAttribute?: string

  @Expose({ name: 'secondary_attribute' })
  public secondaryAttribute?: string

  @Expose({ name: 'issued_date_attribute' })
  public issuedDateAttribute?: string

  @Expose({ name: 'expiry_date_attribute' })
  public expiryDateAttribute?: string

  public constructor(partial?: Partial<Omit<BrandingOverlay, 'type'>>) {
    super(partial)
    Object.assign(this, partial)
    this.type = OverlayType.BrandingOverlay
  }
}
