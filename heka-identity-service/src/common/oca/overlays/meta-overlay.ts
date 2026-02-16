import { Expose } from 'class-transformer'

import { BaseOverlay, IBaseOverlayData } from './base-overlay'
import { OverlayType } from './consts'

export interface IMetaOverlayData extends IBaseOverlayData {
  language: string
  name: string
  description: string
  credentialHelpText: string
  credentialSupportUrl: string
  issuer: string
  issuerDescription: string
  issuerUrl: string
  watermark?: string
}

export class MetaOverlay extends BaseOverlay implements IMetaOverlayData {
  @Expose({ name: 'language' })
  public language!: string

  @Expose({ name: 'name' })
  public name!: string

  @Expose({ name: 'description' })
  public description!: string

  @Expose({ name: 'credential_help_text' })
  public credentialHelpText!: string

  @Expose({ name: 'credential_support_url' })
  public credentialSupportUrl!: string

  @Expose({ name: 'issuer' })
  public issuer!: string

  @Expose({ name: 'issuer_description' })
  public issuerDescription!: string

  @Expose({ name: 'issuer_url' })
  public issuerUrl!: string

  @Expose({ name: 'watermark' })
  public watermark?: string

  public constructor(partial?: Partial<Omit<MetaOverlay, 'type'>>) {
    super(partial)
    Object.assign(this, partial)
    this.type = OverlayType.MetaOverlay
  }
}
