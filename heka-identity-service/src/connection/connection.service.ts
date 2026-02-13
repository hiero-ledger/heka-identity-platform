import { DidCommModuleConfig } from '@credo-ts/didcomm'
import { Injectable, InternalServerErrorException } from '@nestjs/common'

import { TenantAgent } from 'common/agent'

import { AuthInfo } from '../common/auth'
import { UserService } from '../user/user.service'

import {
  AcceptInvitationDto,
  ConnectionRecordDto,
  CreateInvitationRequestDto,
  CreateInvitationResponseDto,
} from './dto'

@Injectable()
export class ConnectionService {
  public constructor(private readonly userService: UserService) {}
  public async find(tenantAgent: TenantAgent): Promise<ConnectionRecordDto[]> {
    const connectionRecords = await tenantAgent.modules.connections.getAll()
    return connectionRecords.map((record) => new ConnectionRecordDto(record))
  }

  public async createInvitation(
    authInfo: AuthInfo,
    tenantAgent: TenantAgent,
    req: CreateInvitationRequestDto,
  ): Promise<CreateInvitationResponseDto> {
    const user = await this.userService.getMe(authInfo)
    const config = {
      label: req.label ?? user.name,
      alias: req.alias,
      imageUrl: req.imageUrl ?? user.logo,
      multiUseInvitation: req.multiUseInvitation,
    }
    const didcommConfig = tenantAgent.dependencyManager.resolve(DidCommModuleConfig)

    const outOfBandRecord = await tenantAgent.modules.oob.createInvitation(config)

    const invitationUrl = outOfBandRecord.outOfBandInvitation.toUrl({ domain: didcommConfig.endpoints[0] })
    return new CreateInvitationResponseDto(outOfBandRecord.id, invitationUrl)
  }

  public async acceptInvitation(tenantAgent: TenantAgent, req: AcceptInvitationDto): Promise<ConnectionRecordDto> {
    const config = {
      label: req.label,
      alias: req.alias,
    }

    const { connectionRecord } = await tenantAgent.modules.oob.receiveInvitationFromUrl(req.invitationUrl, config)

    // It is expected that connectionRecord is created
    // because ConnectionsModule is configured with autoAcceptConnections=true
    if (!connectionRecord) {
      throw new InternalServerErrorException('Agent connection has not been established')
    }

    return new ConnectionRecordDto(connectionRecord)
  }

  public async get(tenantAgent: TenantAgent, id: string): Promise<ConnectionRecordDto | null> {
    const connectionRecord = await tenantAgent.modules.connections.findById(id)
    if (connectionRecord) {
      return new ConnectionRecordDto(connectionRecord)
    }

    const connectionRecordsByOobId = await tenantAgent.modules.connections.findAllByOutOfBandId(id)
    if (connectionRecordsByOobId.length) {
      return new ConnectionRecordDto(connectionRecordsByOobId[0])
    }

    return null
  }
}
