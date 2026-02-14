import { Module } from '@nestjs/common'

import { AgentModule } from 'common/agent'
import { FileStorageModule } from 'common/file-storage/file-storage.module'
import { OpenId4VcIssuerModule } from 'openid4vc/issuer/issuer.module'

import { UserController } from './user.controller'
import { UserService } from './user.service'

@Module({
  imports: [AgentModule, OpenId4VcIssuerModule, FileStorageModule],
  controllers: [UserController],
  providers: [UserService],
  exports: [UserService],
})
export class UserModule {}
