import { Expose } from 'class-transformer'

import { BaseOverlay, IBaseOverlayData } from './base-overlay'
import { OverlayType } from './consts'

export interface IStandardOverlayData extends IBaseOverlayData {
  attributeStandards: Record<string, string>
}

export class StandardOverlay extends BaseOverlay implements IStandardOverlayData {
  @Expose({ name: 'attribute_standards' })
  public attributeStandards!: Record<string, string>

  public constructor(partial?: Partial<Omit<StandardOverlay, 'type'>>) {
    super(partial)
    Object.assign(this, partial)
    this.type = OverlayType.StandardOverlay
  }
}
