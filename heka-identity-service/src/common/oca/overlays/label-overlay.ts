import { Expose } from 'class-transformer'

import { BaseOverlay, IBaseOverlayData } from './base-overlay'
import { OverlayType } from './consts'

export interface ILabelOverlayData extends IBaseOverlayData {
  language: string
  attributeLabels: Record<string, string>
  attributeCategories: string[]
  categoryLabels: Record<string, string>
}

export class LabelOverlay extends BaseOverlay implements ILabelOverlayData {
  @Expose({ name: 'language' })
  public language!: string

  @Expose({ name: 'attribute_labels' })
  public attributeLabels!: Record<string, string>

  @Expose({ name: 'attribute_categories' })
  public attributeCategories!: string[]

  @Expose({ name: 'category_labels' })
  public categoryLabels!: Record<string, string>

  public constructor(partial?: Partial<Omit<LabelOverlay, 'type'>>) {
    super(partial)
    Object.assign(this, partial)
    this.type = OverlayType.LabelOverlay
  }
}
