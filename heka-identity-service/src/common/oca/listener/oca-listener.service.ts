import { Injectable } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'

import { OCAFilesService } from '../oca.files.service'

export enum OCAListenerActions {
  RefreshAll = 'oca.files.refresh.all',
}

/*TODO: It will be good to add method for update OCA files for one schema */
export class RefreshOCAFilesEvent {}

@Injectable()
export class OCAListener {
  public constructor(private schemaActionsService: OCAFilesService) {}

  @OnEvent(OCAListenerActions.RefreshAll)
  protected async handleRefreshOCAFilesEvent(event: RefreshOCAFilesEvent) {
    await this.schemaActionsService.run()
  }
}
