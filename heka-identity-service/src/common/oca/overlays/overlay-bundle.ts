import { Expose } from 'class-transformer'

import { BaseOverlay, IBaseOverlayData } from './base-overlay'
import { BrandingOverlay, IBrandingOverlayData } from './branding-overlay'
import { CaptureBase, ICaptureBaseData } from './capture-base'
import { CharacterEncodingOverlay } from './charaster-encoding-overlay'
import { OverlayType } from './consts'
import { FormatOverlay } from './format-overlay'
import { InformationOverlay } from './information-overlay'
import { LabelOverlay } from './label-overlay'
import { ILegacyBrandingOverlayData, LegacyBrandingOverlay } from './legacy-branding-overlay'
import { MetaOverlay } from './meta-overlay'
import { OverlayTypeMap } from './overlay-mapper'
import { StandardOverlay } from './standard-overlay'

export interface IOverlayBundleMetadata {
  name: Record<string, string>
  description: Record<string, string>
  credentialHelpText?: Record<string, string>
  credentialSupportUrl?: Record<string, string>
  issuer: Record<string, string>
  issuerDescription?: Record<string, string>
  issuerUrl?: Record<string, string>
}

export class OverlayBundleMetadata implements IOverlayBundleMetadata {
  @Expose({ name: 'name' })
  public name!: Record<string, string>

  @Expose({ name: 'description!' })
  public description!: Record<string, string>

  @Expose({ name: 'credential_help_text' })
  public credentialHelpText?: Record<string, string>

  @Expose({ name: 'credential_support_url' })
  public credentialSupportUrl?: Record<string, string>

  @Expose({ name: 'issuer' })
  public issuer!: Record<string, string>

  @Expose({ name: 'issuer_description' })
  public issuerDescription?: Record<string, string>

  @Expose({ name: 'issuer_url' })
  public issuerUrl?: Record<string, string>

  public constructor(partial?: Partial<OverlayBundleMetadata>) {
    Object.assign(this, partial)
  }
}

export interface IOverlayBundleAttribute {
  name: string
  type: string
  information?: Record<string, string>
  label?: Record<string, string>
  format?: string
  characterEncoding?: string
  standard?: string
}

export class OverlayBundleAttribute implements IOverlayBundleAttribute {
  @Expose({ name: 'name' })
  public name!: string

  @Expose({ name: 'type' })
  public type!: string

  @Expose({ name: 'information' })
  public information?: Record<string, string>

  @Expose({ name: 'label' })
  public label?: Record<string, string>

  @Expose({ name: 'format' })
  public format?: string

  @Expose({ name: 'character_encoding' })
  public characterEncoding?: string

  @Expose({ name: 'standard' })
  public standard?: string

  public constructor(partial?: Partial<OverlayBundleAttribute>) {
    Object.assign(this, partial)
  }
}

export interface IOverlayBundleData {
  captureBase: ICaptureBaseData
  overlays: IBaseOverlayData[]
}

export class OverlayBundle {
  @Expose({ name: 'credential_definition_id' })
  public credentialDefinitionId!: string

  @Expose({ name: 'capture_base' })
  public captureBase!: CaptureBase

  @Expose({ name: 'overlays' })
  public overlays!: BaseOverlay[]

  @Expose({ name: 'languages' })
  public languages!: string[]

  @Expose({ name: 'metadata' })
  public metadata!: OverlayBundleMetadata

  @Expose({ name: 'attributes' })
  public attributes!: OverlayBundleAttribute[]

  @Expose({ name: 'flagged_attributes' })
  public flaggedAttributes!: OverlayBundleAttribute[]

  public constructor(credentialDefinitionId: string, bundle: IOverlayBundleData) {
    this.credentialDefinitionId = credentialDefinitionId
    this.captureBase = new CaptureBase(bundle.captureBase)
    this.overlays = bundle.overlays
      .filter((overlay) => !overlay.type.startsWith('aries/overlays/branding/'))
      .map((overlay) => {
        const OverlayClass = OverlayTypeMap.get(overlay.type) || BaseOverlay
        return new OverlayClass(overlay)
      })
    this.overlays.push(
      ...bundle.overlays
        .filter((overlay) => overlay.type === OverlayType.LegacyBrandingOverlay)
        .map((overlay) => {
          const OverlayClass = (OverlayTypeMap.get(overlay.type) ||
            LegacyBrandingOverlay) as typeof LegacyBrandingOverlay
          return new OverlayClass(overlay as ILegacyBrandingOverlayData)
        }),
    )
    this.overlays.push(
      ...bundle.overlays
        .filter((overlay) => overlay.type === OverlayType.BrandingOverlay)
        .map((overlay) => {
          const OverlayClass = (OverlayTypeMap.get(overlay.type) || BrandingOverlay) as typeof BrandingOverlay
          return new OverlayClass(overlay as IBrandingOverlayData)
        }),
    )
    this.languages = this.processLanguages()
    this.metadata = this.processMetadata()
    this.attributes = this.processOverlayAttributes()
    this.flaggedAttributes = this.attributes.filter((attribute) =>
      this.captureBase.flaggedAttributes.includes(attribute.name),
    )
  }

  public get branding(): BrandingOverlay | undefined {
    return this.overlaysForType<BrandingOverlay>(OverlayType.BrandingOverlay)[0]
  }

  public getAttribute(name: string): IOverlayBundleAttribute | undefined {
    return this.attributes.find((attribute) => attribute.name === name)
  }

  public getFlaggedAttribute(name: string): IOverlayBundleAttribute | undefined {
    return this.flaggedAttributes.find((attribute) => attribute.name === name)
  }

  private processMetadata(): OverlayBundleMetadata {
    const metadata: OverlayBundleMetadata = new OverlayBundleMetadata({
      name: {},
      description: {},
      credentialHelpText: {},
      credentialSupportUrl: {},
      issuer: {},
      issuerDescription: {},
      issuerUrl: {},
    })
    for (const overlay of this.overlaysForType<MetaOverlay>(OverlayType.MetaOverlay)) {
      const language = overlay.language ?? 'en'
      const {
        name,
        description,
        credentialHelpText: credentialHelpText,
        credentialSupportUrl: credentialSupportUrl,
        issuer,
        issuerDescription: issuerDescription,
        issuerUrl: issuerUrl,
      } = overlay

      if (name) {
        metadata.name[language] = name
      }
      if (description) {
        metadata.description[language] = description
      }
      if (credentialHelpText) {
        metadata.credentialHelpText![language] = credentialHelpText
      }
      if (credentialSupportUrl) {
        metadata.credentialSupportUrl![language] = credentialSupportUrl
      }
      if (issuer) {
        metadata.issuer[language] = issuer
      }
      if (issuerDescription) {
        metadata.issuerDescription![language] = issuerDescription
      }
      if (issuerUrl) {
        metadata.issuerUrl![language] = issuerUrl
      }
    }
    return metadata
  }

  private processLanguages(): string[] {
    const languages: string[] = []
    for (const overlay of this.overlaysForType<MetaOverlay>(OverlayType.MetaOverlay)) {
      const language = overlay.language
      if (language && !languages.includes(language)) {
        languages.push(language)
      }
    }
    languages.sort((a, b) => a.localeCompare(b))
    return languages
  }

  private processOverlayAttributes(): OverlayBundleAttribute[] {
    const attributes: OverlayBundleAttribute[] = []
    const attributeMap = new Map(Object.entries(this.captureBase.attributes))
    for (const [name, type] of attributeMap) {
      attributes.push(
        new OverlayBundleAttribute({
          name,
          type,
          information: this.processInformationForAttribute(name),
          label: this.processLabelForAttribute(name),
          characterEncoding: this.processCharacterEncodingForAttribute(name),
          standard: this.processStandardForAttribute(name),
          format: this.processFormatForAttribute(name),
        }),
      )
    }
    return attributes
  }

  private processInformationForAttribute(key: string): Record<string, string> {
    const information: Record<string, string> = {}
    for (const overlay of this.overlaysForType<InformationOverlay>(OverlayType.InformationOverlay)) {
      if (overlay.attributeInformation?.[key]) {
        const language = overlay.language ?? 'en'
        information[language] = overlay.attributeInformation[key]
      }
    }
    return information
  }

  private processLabelForAttribute(key: string): Record<string, string> {
    const label: Record<string, string> = {}
    for (const overlay of this.overlaysForType<LabelOverlay>(OverlayType.LabelOverlay)) {
      if (overlay.attributeLabels?.[key]) {
        const language = overlay.language ?? 'en'
        label[language] = overlay.attributeLabels[key]
      }
    }
    return label
  }

  private processCharacterEncodingForAttribute(key: string): string | undefined {
    for (const overlay of this.overlaysForType<CharacterEncodingOverlay>(OverlayType.CharacterEncodingOverlay)) {
      if (overlay.attributeCharacterEncoding?.[key]) {
        return overlay.attributeCharacterEncoding[key]
      }
    }
    return
  }

  private processStandardForAttribute(key: string): string | undefined {
    for (const overlay of this.overlaysForType<StandardOverlay>(OverlayType.StandardOverlay)) {
      if (overlay.attributeStandards?.[key]) {
        return overlay.attributeStandards[key]
      }
    }
    return
  }

  private processFormatForAttribute(key: string): string | undefined {
    for (const overlay of this.overlaysForType<FormatOverlay>(OverlayType.FormatOverlay)) {
      if (overlay.attributeFormats?.[key]) {
        return overlay.attributeFormats[key]
      }
    }
    return
  }

  private overlaysForType<T>(type: string): T[] {
    return this.overlays.filter((overlay) => overlay.type === type) as T[]
  }
}
