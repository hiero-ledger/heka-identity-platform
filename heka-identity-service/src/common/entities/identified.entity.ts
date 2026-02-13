import { PrimaryKey } from '@mikro-orm/core'

import { uuid } from 'utils/misc'

interface IdentifiedProps {
  id?: string
}

export class Identified {
  @PrimaryKey()
  public id: string

  public constructor(props?: IdentifiedProps) {
    this.id = props?.id ?? uuid()
  }
}
