import { Expose } from 'class-transformer'

import { BaseOverlay, IBaseOverlayData } from './base-overlay'
import { OverlayType } from './consts'

export interface IFormatOverlayData extends IBaseOverlayData {
  attributeFormats: Record<string, string>
}

export class FormatOverlay extends BaseOverlay implements IFormatOverlayData {
  @Expose({ name: 'attribute_formats' })
  public attributeFormats!: Record<string, string>

  public constructor(partial?: Partial<Omit<FormatOverlay, 'type'>>) {
    super(partial)
    Object.assign(this, partial)
    this.type = OverlayType.FormatOverlay
  }
}
