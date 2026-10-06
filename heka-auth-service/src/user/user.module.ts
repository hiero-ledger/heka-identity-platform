import { ConfigModule } from '@config'
import { Token, User } from '@core/database'
import { MikroOrmModule } from '@mikro-orm/nestjs'
import { Module } from '@nestjs/common'

import { OAuthModule } from '../oauth'
import { AdminBootstrapService } from './admin-bootstrap.service'
import { UserController } from './user.controller'
import { UserService } from './user.service'
import { UserRoleService } from './user-role.service'
import { UsersController } from './users.controller'

@Module({
  imports: [MikroOrmModule.forFeature({ entities: [User, Token] }), ConfigModule, OAuthModule],
  controllers: [UserController, UsersController],
  providers: [UserService, UserRoleService, AdminBootstrapService],
  exports: [UserService],
})
export class UserModule {}
