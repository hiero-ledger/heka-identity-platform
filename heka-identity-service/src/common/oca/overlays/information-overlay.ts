import { Expose } from 'class-transformer'

import { BaseOverlay, IBaseOverlayData } from './base-overlay'
import { OverlayType } from './consts'

export interface IInformationOverlayData extends IBaseOverlayData {
  language: string
  attributeInformation: Record<string, string>
}

export class InformationOverlay extends BaseOverlay implements IInformationOverlayData {
  @Expose({ name: 'language' })
  public language!: string

  @Expose({ name: 'attribute_information' })
  public attributeInformation!: Record<string, string>

  public constructor(partial?: Partial<Omit<InformationOverlay, 'type'>>) {
    super(partial)
    Object.assign(this, partial)
    this.type = OverlayType.InformationOverlay
  }
}
