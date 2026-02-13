import { Expose } from 'class-transformer'

export interface IBaseOverlayData {
  type: string
  captureBase: string
  digest?: string
}

export class BaseOverlay implements IBaseOverlayData {
  @Expose({ name: 'type' })
  public type!: string

  @Expose({ name: 'capture_base' })
  public captureBase!: string

  @Expose({ name: 'digest' })
  public digest?: string

  public constructor(partial?: Partial<Omit<BaseOverlay, 'type'>>) {
    Object.assign(this, partial)
    this.type = ''
  }
}
