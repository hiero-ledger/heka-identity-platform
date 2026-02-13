import { ConfigModule } from '@config'
import { Token, User } from '@core/database'
import { MikroOrmModule } from '@mikro-orm/nestjs'
import { Module } from '@nestjs/common'

import { OAuthModule } from '../oauth'
import { UserController } from './user.controller'
import { UserService } from './user.service'

@Module({
  imports: [MikroOrmModule.forFeature({ entities: [User, Token] }), ConfigModule, OAuthModule],
  controllers: [UserController],
  providers: [UserService],
  exports: [UserService],
})
export class UserModule {}
