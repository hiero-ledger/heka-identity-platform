import { AgentContext, injectable, Kms } from '@credo-ts/core'
import {
  OpenId4VciCredentialConfigurationsSupportedWithFormats,
  OpenId4VciCredentialIssuerMetadataDisplay,
} from '@credo-ts/openid4vc'
import { BadRequestException, ConflictException } from '@nestjs/common'

import { TenantAgent } from 'common/agent'

import { toRecord } from '../../utils/array'

import {
  FindSupportedCredentialsDto,
  OpenId4VcIssuerRecordDto,
  OpenId4VcIssuersCreateDto,
  OpenId4VcIssuersUpdateMetadataDto,
} from './dto'
import {
  CredoCredentialConfigurationSupportedWithId,
  DisplayMetadata,
  OpenId4VciCredentialConfigurationSupportedWithId,
} from './dto/common/credential'
import { UpdateIssuerSupportedCredentialsAction } from './dto/update-issuer.dto'

@injectable()
export class OpenId4VcIssuerService {
  public async createIssuer(
    tenantAgent: TenantAgent,
    options: OpenId4VcIssuersCreateDto,
  ): Promise<OpenId4VcIssuerRecordDto> {
    const allIssuers = await tenantAgent.openid4vc.issuer.getAllIssuers()
    const existingIssuers = allIssuers.filter((i) => i.issuerId === options.publicIssuerId)
    if (existingIssuers.length) {
      throw new ConflictException(`Issuer with DID ${options.publicIssuerId} has been already created`)
    }

    const issuer = await tenantAgent.openid4vc.issuer.createIssuer({
      issuerId: options.publicIssuerId,
      credentialConfigurationsSupported: this.parseCredentialsSupported(tenantAgent, options.credentialsSupported),
      display: options.display,
    })
    return OpenId4VcIssuerRecordDto.fromOpenIdVcIssuerRecord(issuer)
  }

  public async find(tenantAgent: TenantAgent, publicIssuerId: string): Promise<OpenId4VcIssuerRecordDto[]> {
    const allIssuers = await tenantAgent.openid4vc.issuer.getAllIssuers()
    const issuers = allIssuers.filter((i) => i.issuerId === publicIssuerId)
    return issuers.map((issuer) => OpenId4VcIssuerRecordDto.fromOpenIdVcIssuerRecord(issuer))
  }

  public async updateIssuerMetadata(
    tenantAgent: TenantAgent,
    issuerId: string,
    req: OpenId4VcIssuersUpdateMetadataDto,
  ): Promise<OpenId4VcIssuerRecordDto> {
    const issuer = await tenantAgent.openid4vc.issuer.getIssuerByIssuerId(issuerId)

    let credentialConfigurationsSupported = {}
    let display: OpenId4VciCredentialIssuerMetadataDisplay[] = []

    const credentialsSupportedRecord: OpenId4VciCredentialConfigurationsSupportedWithFormats | undefined =
      req.credentialsSupported ? this.parseCredentialsSupported(tenantAgent, req.credentialsSupported) : undefined
    switch (req.action) {
      case UpdateIssuerSupportedCredentialsAction.Replace: {
        credentialConfigurationsSupported = credentialsSupportedRecord ?? issuer.credentialConfigurationsSupported
        display = req.display ?? []
        break
      }
      case UpdateIssuerSupportedCredentialsAction.Add: {
        const credentialsSupportedIds = Object.keys(issuer.credentialConfigurationsSupported)
        const duplicate = (
          req.credentialsSupported as {
            id: string
          }[]
        ).find((credential) => credentialsSupportedIds.includes(credential.id))
        if (duplicate) {
          throw new BadRequestException(`Credential with id ${duplicate.id} already exists.`)
        }

        credentialConfigurationsSupported = credentialsSupportedRecord
          ? { ...issuer.credentialConfigurationsSupported, ...credentialsSupportedRecord }
          : issuer.credentialConfigurationsSupported
        display = issuer.display ? issuer.display.concat(req.display ?? []) : []
        break
      }
      default: {
        credentialConfigurationsSupported = credentialsSupportedRecord ?? issuer.credentialConfigurationsSupported
      }
    }

    // FIXME: should return the updated record, now we fetch (AGAIN!!)
    await tenantAgent.openid4vc.issuer.updateIssuerMetadata({
      issuerId,
      credentialConfigurationsSupported,
      display,
    })

    const updatedIssuer = await tenantAgent.openid4vc.issuer.getIssuerByIssuerId(issuerId)
    return OpenId4VcIssuerRecordDto.fromOpenIdVcIssuerRecord(updatedIssuer)
  }

  public async supportedCredentials(
    tenantAgent: TenantAgent,
    query: FindSupportedCredentialsDto,
  ): Promise<OpenId4VciCredentialConfigurationSupportedWithId[]> {
    const issuer = await tenantAgent.openid4vc.issuer.getIssuerByIssuerId(query.publicIssuerId)

    return Object.entries(issuer.credentialConfigurationsSupported)
      .reduce<CredoCredentialConfigurationSupportedWithId[]>(
        (supportedConfigurations, [configurationId, credentialConfiguration]) => {
          if (query.credentialType && credentialConfiguration.format === query.credentialType) {
            supportedConfigurations.push({ id: configurationId, ...credentialConfiguration })
          }
          return supportedConfigurations
        },
        [],
      )
      .map((credential) =>
        OpenId4VciCredentialConfigurationSupportedWithId.fromOpenIdVcCredentialSupportedWithId(credential),
      )
  }

  public async applyUserDisplay(tenantAgent: TenantAgent, display: DisplayMetadata): Promise<void> {
    const dids = await tenantAgent.dids.getCreatedDids()
    for (const did of dids) {
      const issuerRecords = await this.find(tenantAgent, did.did)
      for (const issuer of issuerRecords) {
        await this.updateIssuerMetadata(tenantAgent, issuer.publicIssuerId, {
          action: UpdateIssuerSupportedCredentialsAction.Replace,
          display: [display],
        })
      }
    }
  }

  private parseCredentialsSupported(
    tenantAgent: TenantAgent,
    credentialsSupported: OpenId4VciCredentialConfigurationSupportedWithId[],
  ): OpenId4VciCredentialConfigurationsSupportedWithFormats {
    let credentialConfigurationsSupported = credentialsSupported

    // Add default proof_types_supported property, if needed
    if (credentialsSupported.some((configuration) => !configuration.proof_types_supported)) {
      const supportedSignatureAlgorithms = this.getSupportedJwaSignatureAlgorithms(tenantAgent.context)
      credentialConfigurationsSupported = credentialConfigurationsSupported.map((configuration) => {
        if (!configuration.proof_types_supported) {
          configuration.proof_types_supported = {
            jwt: { proof_signing_alg_values_supported: supportedSignatureAlgorithms },
          }
        }
        return configuration
      })
    }

    return toRecord(credentialConfigurationsSupported, 'id') as OpenId4VciCredentialConfigurationsSupportedWithFormats
  }

  private getSupportedJwaSignatureAlgorithms(agentContext: AgentContext) {
    const kms = agentContext.resolve(Kms.KeyManagementApi)
    return Object.values(Kms.KnownJwaSignatureAlgorithms).filter(
      (algorithm) =>
        kms.supportedBackendsForOperation({
          operation: 'sign',
          algorithm,
        }).length > 0,
    )
  }
}
