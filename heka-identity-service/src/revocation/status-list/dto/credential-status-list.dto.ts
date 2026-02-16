import { ApiProperty } from '@nestjs/swagger'

import { StatusListPurpose } from '../../../common/entities/credential-status-list.entity'

const CONTEXT_V2 = 'https://www.w3.org/ns/credentials/v2'
export const CredentialStatusListType = ['VerifiableCredential', 'BitstringStatusListCredential']
export const CredentialStatusListSubjectType = 'BitstringStatusList'

interface CredentialStatusListSubjectProps {
  id: string
  statusPurpose: StatusListPurpose
  encodedList: string
}

export class CredentialStatusListSubject {
  @ApiProperty()
  public id!: string

  @ApiProperty()
  public type!: string

  @ApiProperty()
  public statusPurpose!: StatusListPurpose

  @ApiProperty()
  public encodedList!: string

  public constructor(props: CredentialStatusListSubjectProps) {
    this.id = props.id
    this.type = CredentialStatusListSubjectType
    this.statusPurpose = props.statusPurpose
    this.encodedList = props.encodedList
  }
}

interface CredentialStatusListProps {
  id: string
  issuer: string
  validFrom: string
  credentialSubject: CredentialStatusListSubject
}

export class CredentialStatusList {
  @ApiProperty({ type: [String] })
  public '@context'!: Array<string>

  @ApiProperty()
  public id!: string

  @ApiProperty({ type: [String] })
  public type!: string[]

  @ApiProperty()
  public issuer!: string

  @ApiProperty()
  public validFrom!: string

  @ApiProperty({ type: CredentialStatusListSubject })
  public credentialSubject!: CredentialStatusListSubject

  public constructor(props: CredentialStatusListProps) {
    this['@context'] = [CONTEXT_V2]
    this.type = CredentialStatusListType
    this.id = props.id
    this.issuer = props.issuer
    this.validFrom = props.validFrom
    this.credentialSubject = props.credentialSubject
  }
}
