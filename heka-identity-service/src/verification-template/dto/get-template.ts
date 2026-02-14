import { VerificationTemplate } from './common/verification-template'

export class GetVerificationTemplateResponse extends VerificationTemplate {
  public constructor(partial?: Partial<GetVerificationTemplateResponse>) {
    super(partial)
    Object.assign(this, partial)
  }
}
