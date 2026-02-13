import { Expose } from 'class-transformer'

import { CaptureBaseType } from './consts'

export interface ICaptureBaseData {
  type: string
  classification: string
  attributes: Record<string, string>
  flaggedAttributes: string[]
  digest?: string
}

export class CaptureBase implements ICaptureBaseData {
  @Expose({ name: 'type' })
  public type: string

  @Expose({ name: 'classification' })
  public classification!: string

  @Expose({ name: 'attributes' })
  public attributes!: Record<string, string>

  @Expose({ name: 'flagged_attributes' })
  public flaggedAttributes!: string[]

  @Expose({ name: 'digest' })
  public digest?: string

  public constructor(partial?: Partial<Omit<CaptureBase, 'type'>>) {
    Object.assign(this, partial)
    this.type = CaptureBaseType
  }
}
