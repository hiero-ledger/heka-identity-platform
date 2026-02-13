import { Expose } from 'class-transformer'

import { BaseOverlay, IBaseOverlayData } from './base-overlay'
import { OverlayType } from './consts'

export interface ICharacterEncodingOverlayData extends IBaseOverlayData {
  defaultCharacterEncoding: string
  attributeCharacterEncoding: Record<string, string>
}

export class CharacterEncodingOverlay extends BaseOverlay implements ICharacterEncodingOverlayData {
  @Expose({ name: 'default_character_encoding' })
  public defaultCharacterEncoding!: string

  @Expose({ name: 'attribute_character_encoding' })
  public attributeCharacterEncoding!: Record<string, string>

  public constructor(partial?: Partial<Omit<CharacterEncodingOverlay, 'type'>>) {
    super(partial)
    Object.assign(this, partial)
    this.type = OverlayType.CharacterEncodingOverlay
  }
}
