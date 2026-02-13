import fs from 'fs'
import { join } from 'path'

import { EntityManager } from '@mikro-orm/core'
import { Inject, Injectable } from '@nestjs/common'
import { ConfigType } from '@nestjs/config'
import { Mutex } from 'async-mutex'
import { instanceToPlain } from 'class-transformer'
import { sha256 } from 'ethers'

import FileStorage from '../../config/file-storage'
import { SchemaRegistration } from '../entities/schema-registration.entity'
import { FileStorageService } from '../file-storage/file-storage.service'
import { InjectLogger, Logger } from '../logger'
import { ProtocolType } from '../types'
import { AriesRegistrationCredentials } from '../types/registration-credentials'

import { BaseOverlay, BrandingOverlay, BundleIndex, CaptureBase, MetaOverlay, OverlayBundle } from './overlays'

const mutex = new Mutex()

@Injectable()
export class OCAFilesService {
  private OCA_STORAGE_ROOT_PATH = 'oca'
  private DEFAULT_OCA_INDEX_FILE = 'ocabundles.json'
  private DEFAULT_SCHEMA_BACKGROUND_LOGO =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAHgAAAB4CAYAAAA5ZDbSAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAKSSURBVHgB7d27alRRFIDhNUGMFwgIdj6BXbp5CSt7cV7A2AipRVu1Fu2EVF7adIIvECttbAMBO40YVDLOAVfhEMJEz2Xv//x/dfoPzmXvzTqT+f7ePAzbWhg6geEJDE9geALDExiewPAEhicwPIHhCQxPYHgCwxMYnsDwBIYnMDyB4QkMT2B4AsMTGJ7A8ASGJzA8geEJ3GNfvh5G3wncQw3so6cvYnrjVvTdubDOamCf7byJ5zuvF9ffYogE7qASYDOBW6wk2EzgFioRNhP4PyoZNhP4H6oBNhP4DNUEmwm8QjXCZgKfUs2wmcAnRIDNBF6qWVIkwGYCL/V4AUzKzQZ4AsMTGJ7A8ASGJzA8geEJDE9geALDExiea9F/Oj74ED/evwpaowdO2OODj0FstMB02Gx0wGOBzUYDPDbYDA88VtgMCzx22AwHLOzfYYCFPbnqgYU9vWqBhV2t6oCFPVvVAR/tPgxbPXeT4AkMT2B4AhdS8/J4tPsg2s4N/4GbH36On4uvgl+f3kUXCTxQXcNmAvdcX7CZwD11bWMttqaX4/vLu9FnAndcwt68vh5DJHBHDQ2bCdxyG+uTuDO9FLPNi1FC1QDnzOXtq1FkDeztBeps88LiupzlheKBl0cabW+VJVwqbFYscOmzqkqHzYoDFrbdigEWtpsGBxa22wYDFrafegcWtt96A65lguvb2RUEbNY5cG2jeUm4TZ0Bk2Yu11zrwMKWVevAzf/5hC2n1h844paVpyrhCQyv9Wfwk/v3osvOD3xCorYm8/29eRg2b9HwBIYnMDyB4QkMT2B4AsMTGJ7A8ASGJzA8geEJDE9geALDExiewPAEhicwPIHhCQxPYHgCwxMYnsDwBIb3G3ICf7ke4NwgAAAAAElFTkSuQmCC'
  private DEFAULT_SCHEMA_BACKGROUND_COLOR = '#f58529'

  private readonly publicPath: string

  public constructor(
    @Inject(FileStorage.KEY)
    private readonly config: ConfigType<typeof FileStorage>,
    @InjectLogger(OCAFilesService)
    private readonly logger: Logger,
    private readonly fileStorageService: FileStorageService,
    private readonly em: EntityManager,
  ) {
    this.publicPath = this.config?.fileSystemConfig?.path ?? 'files'
  }

  private saveFile = async (fileName: string, content: string) => {
    const logger = this.logger.child('saveFile')
    logger.trace('>')
    const mutexRelease = await mutex.acquire()
    try {
      const fileDir = join(this.publicPath, this.OCA_STORAGE_ROOT_PATH)
      if (!fs.existsSync(fileDir)) {
        fs.mkdirSync(fileDir, { recursive: true })
      }
      const filePath = join(fileDir, `${fileName}`)
      await fs.promises.writeFile(filePath, content)
      logger.debug(`File ${fileName} saved`)
    } catch (error) {
      logger.error(`File ${fileName} wasn't saved.`, error)
    } finally {
      mutexRelease()
    }
    logger.trace('<')
  }

  private jsonToString = (object: unknown) => {
    const json = instanceToPlain(object)
    return JSON.stringify(json, null, 2)
  }

  private makeBundle = (schemaRegistration: SchemaRegistration): OverlayBundle[] => {
    const credDefId = (schemaRegistration?.credentials as AriesRegistrationCredentials).credentialDefinitionId
    const schema = schemaRegistration.schema

    const capture_base_digest = `urn:cred:${sha256(new TextEncoder().encode(this.jsonToString(credDefId)))}`

    const capture_base = new CaptureBase({
      digest: capture_base_digest,
      attributes: {},
      flaggedAttributes: [],
      classification: '',
    })

    const overlays: BaseOverlay[] = []

    overlays.push(
      new MetaOverlay({
        captureBase: capture_base.digest,
        name: schema.name ?? undefined,
        issuer: schema.owner?.name ?? undefined,
        language: 'en',
      }),
    )

    overlays.push(
      new BrandingOverlay({
        captureBase: capture_base.digest,
        logo: schema.logo ? this.fileStorageService.url(schema.logo) : this.DEFAULT_SCHEMA_BACKGROUND_LOGO,
        primaryBackgroundColor: schema.bgColor ?? this.DEFAULT_SCHEMA_BACKGROUND_COLOR,
      }),
    )

    const bundle = new OverlayBundle(credDefId, { captureBase: capture_base, overlays })

    return [bundle]
  }

  private collectBundles = (schemaRegistrations: SchemaRegistration[]): OverlayBundle[][] => {
    const bundles: OverlayBundle[][] = []
    for (const schemaRegistration of schemaRegistrations) {
      const bundle = this.makeBundle(schemaRegistration)
      bundles.push(bundle)
    }
    return bundles
  }

  private makeBundleIndex = (bundles: OverlayBundle[][]): BundleIndex => {
    return bundles.reduce((index: BundleIndex, current) => {
      const sha = sha256(new TextEncoder().encode(this.jsonToString(current)))
      index[current[0].credentialDefinitionId] = {
        path: `${sha}.json`,
        sha256: sha,
      }
      return index
    }, {})
  }

  private reCreateOCAFiles = async () => {
    const logger = this.logger.child('CreateIndexFile action')
    logger.trace('>')

    // collect aries schema registrations
    const schemaRegistrations = await this.em
      .fork()
      .find(
        SchemaRegistration,
        { protocol: ProtocolType.Aries, schema: { isHidden: false } },
        { populate: ['schema', 'schema.owner'] },
      )
    if (!schemaRegistrations) {
      this.logger.info('No schemes registrations for making OCA files')
      return
    }

    // make and collect bundles
    const bundles = this.collectBundles(schemaRegistrations)

    // prepare and save index file
    const indexFile = this.makeBundleIndex(bundles)

    // save bundle files
    for (const bundle of bundles) {
      const fileName = `${indexFile[bundle[0].credentialDefinitionId].sha256}.json`
      await this.saveFile(fileName, this.jsonToString(bundle))
    }

    // save bundles index file
    await this.saveFile(this.DEFAULT_OCA_INDEX_FILE, this.jsonToString(indexFile))

    logger.trace('<')
  }

  public run = async (): Promise<void> => {
    const logger = this.logger.child('Run update OCA files action')
    logger.trace('>')
    /*TODO: It will be good to remove obsoleted files. But it needs the discussion, maybe it's disabled by business rules  */
    // create or update OCA files
    await this.reCreateOCAFiles()
    logger.trace('<')
  }
}
