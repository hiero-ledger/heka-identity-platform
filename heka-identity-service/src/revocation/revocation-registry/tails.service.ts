import type { AnonCredsRevocationRegistryDefinition } from '@credo-ts/anoncreds'

import fs from 'fs'

import { BasicTailsFileService } from '@credo-ts/anoncreds'
import { AgentContext, FileSystem, InjectionSymbols } from '@credo-ts/core'
import { BadRequestException } from '@nestjs/common'
import { ConfigType } from '@nestjs/config'

import ExpressConfig from 'config/express'

import { Agent } from '../../common/agent'

export class TailsService extends BasicTailsFileService {
  public constructor(private readonly appConfig: ConfigType<typeof ExpressConfig>) {
    super()
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  public async uploadTailsFile(
    agentContext: AgentContext,
    options: {
      revocationRegistryDefinition: AnonCredsRevocationRegistryDefinition
    },
  ) {
    return {
      tailsFileUrl: this.location(options.revocationRegistryDefinition.value.tailsHash),
    }
  }

  public async getTailsFile(
    agentContext: AgentContext,
    options: {
      revocationRegistryDefinition: AnonCredsRevocationRegistryDefinition
    },
  ) {
    const { revocationRegistryDefinition } = options
    const { tailsLocation, tailsHash } = revocationRegistryDefinition.value

    try {
      agentContext.config.logger.debug(
        `Checking to see if tails file for URL ${revocationRegistryDefinition.value.tailsLocation} has been stored in the FileSystem`,
      )

      // hash is used as file identifier
      const tailsExists = await this.tailsFileExists(agentContext, tailsHash)
      const tailsFilePath = await this.getTailsFilePath(agentContext, tailsHash)
      agentContext.config.logger.debug(
        `Tails file for ${tailsLocation} ${tailsExists ? 'is stored' : 'is not stored'} at ${tailsFilePath}`,
      )

      if (!tailsExists) {
        agentContext.config.logger.debug(`Retrieving tails file from URL ${tailsLocation}`)
        const fileSystem = agentContext.dependencyManager.resolve<FileSystem>(InjectionSymbols.FileSystem)
        await fileSystem.downloadToFile(tailsLocation, tailsFilePath)
        agentContext.config.logger.debug(`Saved tails file to FileSystem at path ${tailsFilePath}`)
      }

      return { tailsFilePath }
    } catch (error) {
      agentContext.config.logger.error(`Error while retrieving tails file from URL ${tailsLocation}`, {
        error,
      })
      throw error
    }
  }

  public async download(agent: Agent, hash: string) {
    const tailsExists = await this.tailsFileExists(agent.context, hash)
    if (!tailsExists) {
      throw new BadRequestException(`There is no tails file for hash: ${hash}`)
    }

    const tailsFilePath = await this.getTailsFilePath(agent.context, hash)
    return fs.readFileSync(tailsFilePath)
  }

  public location(hash: string) {
    return `${this.appConfig.appEndpoint}/revocation/tails/${hash}`
  }
}
