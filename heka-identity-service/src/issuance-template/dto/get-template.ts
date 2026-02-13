import { IssuanceTemplate } from './common/issuance-template'

export class GetIssuanceTemplateResponse extends IssuanceTemplate {
  public constructor(partial?: Partial<GetIssuanceTemplateResponse>) {
    super(partial)
    Object.assign(this, partial)
  }
}
