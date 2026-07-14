import { PrimaryKey } from '@mikro-orm/decorators/legacy'

import { uuid } from 'utils/misc'

interface IdentifiedProps {
  id?: string
}

export class Identified {
  @PrimaryKey({ type: 'string' })
  public id: string

  public constructor(props?: IdentifiedProps) {
    this.id = props?.id ?? uuid()
  }
}
