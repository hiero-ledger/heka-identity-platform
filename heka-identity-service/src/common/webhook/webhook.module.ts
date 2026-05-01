import { Module } from '@nestjs/common'

import { WebhookEgressService } from './webhook-egress.service'

@Module({
  providers: [WebhookEgressService],
  exports: [WebhookEgressService],
})
export class WebhookModule {}
