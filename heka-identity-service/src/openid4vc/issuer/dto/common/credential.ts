import { OpenId4VciCredentialConfigurationSupportedWithFormats as CredoCredentialConfigurationSupported } from '@credo-ts/openid4vc'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsArray, IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator'

export class IssuerCredentialSubject {
  [key: string]: unknown
}

export enum CredentialFormat {
  SdJwt = 'vc+sd-jwt',
  JwtJson = 'jwt_vc_json',
  JwtVcJsonLd = 'jwt_vc_json-ld',
  LdpVc = 'ldp_vc',
  MsoMdoc = 'mso_mdoc',
}

export class DisplayMetadata {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  public name!: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  public description?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  public background_color?: string

  @ApiPropertyOptional()
  @IsOptional()
  public logo?: {
    url?: string
    alt_text?: string
    [key: string]: unknown
  };

  [key: string]: unknown
}

export class CredentialDefinition {
  @ApiProperty()
  @IsArray()
  public type!: Array<string>

  @ApiPropertyOptional()
  @IsOptional()
  public credentialSubject?: IssuerCredentialSubject
}

export class CredentialDefinitionWithContext extends CredentialDefinition {
  @ApiProperty()
  @IsArray()
  public '@context'!: Array<string>
}

export type CredoCredentialConfigurationSupportedWithId = CredoCredentialConfigurationSupported & { id: string }

// Narrow record types used only inside the static factory methods below.
// Each type reflects the actual shape Credo provides for that specific format.
type SdJwtConfigRecord = CredoCredentialConfigurationSupportedWithId & {
  vct: string
  claims?: IssuerCredentialSubject
  order?: string[]
}
type JwtVcJsonConfigRecord = CredoCredentialConfigurationSupportedWithId & {
  credential_definition: CredentialDefinition
}
type JwtVcJsonLdConfigRecord = CredoCredentialConfigurationSupportedWithId & {
  credential_definition: CredentialDefinitionWithContext
}
type LdpVcConfigRecord = CredoCredentialConfigurationSupportedWithId & {
  credential_definition: CredentialDefinitionWithContext
}
type MsoMdocConfigRecord = CredoCredentialConfigurationSupportedWithId & {
  doctype: string
}

export class OpenId4VciCredentialConfigurationSupportedWithId {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  public id!: string

  @ApiProperty({ enum: CredentialFormat })
  @IsEnum(CredentialFormat)
  public format!: CredentialFormat

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @Type(() => DisplayMetadata)
  public display?: DisplayMetadata[]

  @ApiPropertyOptional()
  @IsOptional()
  public proof_types_supported?: Record<string, unknown>

  public constructor(params?: OpenId4VciCredentialConfigurationSupportedWithId) {
    if (params) {
      this.id = params.id
      this.format = params.format
      this.display = params.display
      this.proof_types_supported = params.proof_types_supported
    }
  }

  public static fromOpenIdVcCredentialSupportedWithId(
    record: CredoCredentialConfigurationSupportedWithId,
  ): OpenId4VciCredentialConfigurationSupportedWithId {
    if (record.format === CredentialFormat.SdJwt) {
      return OpenId4VciSdJwtCredentialSupportedWithId.fromOpenIdVcCredentialSupportedWithId(record)
    } else if (record.format === CredentialFormat.JwtJson) {
      return OpenId4VciJwtVcJsonCredentialSupportedWithId.fromOpenIdVcCredentialSupportedWithId(record)
    } else if (record.format === CredentialFormat.JwtVcJsonLd) {
      return OpenId4VciJwtVcJsonLdCredentialSupportedWithId.fromOpenIdVcCredentialSupportedWithId(record)
    } else if (record.format === CredentialFormat.LdpVc) {
      return OpenId4VciLdpVcCredentialSupportedWithId.fromOpenIdVcCredentialSupportedWithId(record)
    } else if (record.format === CredentialFormat.MsoMdoc) {
      return OpenId4VciMsoMdocCredentialSupportedWithId.fromOpenIdVcCredentialSupportedWithId(record)
    } else {
      throw new Error(`Unsupported credential format ${record.format}`)
    }
  }
}

export class OpenId4VciSdJwtCredentialSupportedWithId extends OpenId4VciCredentialConfigurationSupportedWithId {
  @ApiProperty({ enum: CredentialFormat })
  @IsEnum(CredentialFormat)
  public format!: CredentialFormat.SdJwt

  @ApiPropertyOptional()
  @IsString()
  @IsNotEmpty()
  public vct!: string

  @ApiPropertyOptional()
  @IsOptional()
  public claims?: IssuerCredentialSubject

  @ApiProperty({ isArray: true })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  public order?: string[]

  public constructor(params?: OpenId4VciSdJwtCredentialSupportedWithId) {
    super(params)
    if (params) {
      this.vct = params.vct
      this.claims = params.claims
      this.order = params.order
    }
  }

  public static fromOpenIdVcCredentialSupportedWithId(
    record: CredoCredentialConfigurationSupportedWithId,
  ): OpenId4VciSdJwtCredentialSupportedWithId {
    const r = record as SdJwtConfigRecord
    return new OpenId4VciSdJwtCredentialSupportedWithId({
      id: r.id,
      format: CredentialFormat.SdJwt,
      vct: r.vct,
      claims: r.claims,
      order: r.order,
      display: r.display,
    })
  }
}

export class OpenId4VciJwtVcJsonCredentialSupportedWithId extends OpenId4VciCredentialConfigurationSupportedWithId {
  @ApiProperty({ enum: CredentialFormat })
  @IsEnum(CredentialFormat)
  public format!: CredentialFormat.JwtJson

  @ApiProperty({ type: CredentialDefinition })
  @Type(() => CredentialDefinition)
  public credential_definition!: CredentialDefinition

  public constructor(params?: OpenId4VciJwtVcJsonCredentialSupportedWithId) {
    super(params)
    if (params) {
      this.credential_definition = params.credential_definition
    }
  }

  public static fromOpenIdVcCredentialSupportedWithId(
    record: CredoCredentialConfigurationSupportedWithId,
  ): OpenId4VciJwtVcJsonCredentialSupportedWithId {
    const r = record as JwtVcJsonConfigRecord
    return new OpenId4VciJwtVcJsonCredentialSupportedWithId({
      id: r.id,
      format: CredentialFormat.JwtJson,
      credential_definition: r.credential_definition,
      display: r.display,
    })
  }
}

export class OpenId4VciJwtVcJsonLdCredentialSupportedWithId extends OpenId4VciCredentialConfigurationSupportedWithId {
  @ApiProperty({ enum: CredentialFormat })
  @IsEnum(CredentialFormat)
  public format!: CredentialFormat.JwtVcJsonLd

  @ApiProperty({ type: CredentialDefinitionWithContext })
  @Type(() => CredentialDefinitionWithContext)
  public credential_definition!: CredentialDefinitionWithContext

  public constructor(params?: OpenId4VciJwtVcJsonLdCredentialSupportedWithId) {
    super(params)
    if (params) {
      this.credential_definition = params.credential_definition
    }
  }

  public static fromOpenIdVcCredentialSupportedWithId(
    record: CredoCredentialConfigurationSupportedWithId,
  ): OpenId4VciJwtVcJsonLdCredentialSupportedWithId {
    const r = record as JwtVcJsonLdConfigRecord
    return new OpenId4VciJwtVcJsonLdCredentialSupportedWithId({
      id: r.id,
      format: CredentialFormat.JwtVcJsonLd,
      credential_definition: r.credential_definition,
      display: r.display,
    })
  }
}

export class OpenId4VciLdpVcCredentialSupportedWithId extends OpenId4VciCredentialConfigurationSupportedWithId {
  @ApiProperty({ enum: CredentialFormat })
  @IsEnum(CredentialFormat)
  public format!: CredentialFormat.LdpVc

  @ApiProperty({ type: CredentialDefinitionWithContext })
  @Type(() => CredentialDefinitionWithContext)
  public credential_definition!: CredentialDefinitionWithContext

  public constructor(params?: OpenId4VciLdpVcCredentialSupportedWithId) {
    super(params)
    if (params) {
      this.credential_definition = params.credential_definition
    }
  }

  public static fromOpenIdVcCredentialSupportedWithId(
    record: CredoCredentialConfigurationSupportedWithId,
  ): OpenId4VciLdpVcCredentialSupportedWithId {
    const r = record as LdpVcConfigRecord
    return new OpenId4VciLdpVcCredentialSupportedWithId({
      id: r.id,
      format: CredentialFormat.LdpVc,
      credential_definition: r.credential_definition,
      display: r.display,
    })
  }
}

export class OpenId4VciMsoMdocCredentialSupportedWithId extends OpenId4VciCredentialConfigurationSupportedWithId {
  @ApiProperty({ enum: CredentialFormat })
  @IsEnum(CredentialFormat)
  public format!: CredentialFormat.MsoMdoc

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  public doctype!: string

  public constructor(params?: OpenId4VciMsoMdocCredentialSupportedWithId) {
    super(params)
    if (params) {
      this.doctype = params.doctype
    }
  }

  public static fromOpenIdVcCredentialSupportedWithId(
    record: CredoCredentialConfigurationSupportedWithId,
  ): OpenId4VciMsoMdocCredentialSupportedWithId {
    const r = record as MsoMdocConfigRecord
    return new OpenId4VciMsoMdocCredentialSupportedWithId({
      id: r.id,
      format: CredentialFormat.MsoMdoc,
      doctype: r.doctype,
      display: r.display,
    })
  }
}
