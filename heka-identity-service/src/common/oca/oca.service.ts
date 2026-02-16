import { Injectable } from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'

import { InjectLogger, Logger } from 'common/logger'

import { OCAListenerActions } from './listener/oca-listener.service'

@Injectable()
export class OCAService {
  public constructor(
    @InjectLogger(OCAService)
    private readonly logger: Logger,
    private eventEmitter: EventEmitter2,
  ) {
    this.logger.child('constructor').trace('<>')
  }

  public refreshOCAFiles = () => {
    const logger = this.logger.child('refreshOCAFiles')
    logger.trace('>')
    this.eventEmitter.emit(OCAListenerActions.RefreshAll)
    logger.trace('<')
  }
}
