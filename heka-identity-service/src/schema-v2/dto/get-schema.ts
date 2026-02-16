import { Schema } from './common/schema'

export class GetSchemaResponse extends Schema {
  public constructor(partial?: Partial<GetSchemaResponse>) {
    super(partial)
    Object.assign(this, partial)
  }
}
