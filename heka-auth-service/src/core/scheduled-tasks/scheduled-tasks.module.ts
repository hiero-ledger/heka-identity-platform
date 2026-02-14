import { Token } from '@core/database'
import { MikroOrmModule } from '@mikro-orm/nestjs'
import { Module } from '@nestjs/common'
import { ScheduleModule } from '@nestjs/schedule'

import { ScheduledTaskService } from './scheduled-task.service'

@Module({
  imports: [MikroOrmModule.forFeature({ entities: [Token] }), ScheduleModule.forRoot()],
  providers: [ScheduledTaskService],
  exports: [],
})
export class ScheduledTaskModule {}
