import {
  ChainInfoWithCoreTypes,
  GetChainInfosMsg,
  RemoveSuggestedChainInfoMsg,
  TryUpdateChainMsg,
} from '@keplr-wallet/background'
import { KVStore, toGenerator } from '@keplr-wallet/common'
import { ChainIdHelper } from '@keplr-wallet/cosmos'
import { BACKGROUND_PORT, MessageRequester } from '@keplr-wallet/router'
import { ChainStore as BaseChainStore } from '@keplr-wallet/stores'
import { action, computed, flow, makeObservable, observable, override } from 'mobx'

import { AppChainInfo } from '../config'

export class ChainStore extends BaseChainStore<ChainInfoWithCoreTypes & AppChainInfo> {
  @observable
  protected selectedChainId: string

  @observable
  protected _isInitializing = false
  protected deferChainIdSelect = ''

  public constructor(
    protected readonly embedChainInfos: AppChainInfo[],
    protected readonly requester: MessageRequester,
    protected readonly kvStore: KVStore
  ) {
    super(
      embedChainInfos.map((chainInfo) => {
        return {
          ...chainInfo,
          ...{
            embeded: true,
          },
        }
      })
    )

    this.selectedChainId = embedChainInfos[0].chainId

    makeObservable(this)

    this.init()
  }

  public get isInitializing(): boolean {
    return this._isInitializing
  }

  @action
  public selectChain(chainId: string) {
    if (this._isInitializing) {
      this.deferChainIdSelect = chainId
    }
    this.selectedChainId = chainId
  }

  @computed
  public get current(): ChainInfoWithCoreTypes {
    if (this.hasChain(this.selectedChainId)) {
      return this.getChain(this.selectedChainId).raw
    }

    return this.chainInfos[0].raw
  }

  @flow
  protected *init() {
    this._isInitializing = true
    yield this.getChainInfosFromBackground()

    // Get last view chain id from kv store
    const lastViewChainId = yield* toGenerator(this.kvStore.get<string>('last_view_chain_id'))

    if (!this.deferChainIdSelect) {
      if (lastViewChainId) {
        this.selectChain(lastViewChainId)
      }
    }
    this._isInitializing = false

    if (this.deferChainIdSelect) {
      this.selectChain(this.deferChainIdSelect)
      this.deferChainIdSelect = ''
    }
  }

  @flow
  public *getChainInfosFromBackground() {
    const msg = new GetChainInfosMsg()
    const result = yield* toGenerator(this.requester.sendMessage(BACKGROUND_PORT, msg))
    this.setChainInfos(result.chainInfos)
  }

  @flow
  public *removeChainInfo(chainId: string) {
    const msg = new RemoveSuggestedChainInfoMsg(chainId)
    const chainInfos = yield* toGenerator(this.requester.sendMessage(BACKGROUND_PORT, msg))

    this.setChainInfos(chainInfos)
  }

  @flow
  public *tryUpdateChain(chainId: string) {
    const msg = new TryUpdateChainMsg(chainId)
    const result = yield* toGenerator(this.requester.sendMessage(BACKGROUND_PORT, msg))
    if (result.updated) {
      yield this.getChainInfosFromBackground()
    }
  }

  @override
  protected setChainInfos(chainInfos: (ChainInfoWithCoreTypes & AppChainInfo)[]) {
    super.setChainInfos(
      chainInfos.map((chainInfo) => {
        let hideInUI: boolean

        // When viewed only by typing, `this.embedChainInfos` is not nullable.
        // However, the `setChainInfos` method is executed in the super() call of the constructor,
        // and the field of the class cannot be set before the super() call of the constructor.
        // A strange problem arises here.
        // Typescript doesn't detect this issue at build time.
        // Anyway, `this.embedChainInfos` is undefined when the parent class is being created.
        // There is a problem in the long run because the logic below cannot be grasped by TypeScript.
        // But for now, it is solved in a simple way.
        // If `this.embedChainInfos` is undefined, it is before creation is complete,
        // and chainInfos should be embedded chain infos.
        // TODO: Modify the logic below so that typescript can fully understand it at build time.
        if (this.embedChainInfos) {
          const embedChainInfo = this.embedChainInfos.find(
            (c) => ChainIdHelper.parse(c.chainId).identifier === ChainIdHelper.parse(chainInfo.chainId).identifier
          )
          if (embedChainInfo) {
            hideInUI = !!embedChainInfo.hideInUI
          } else {
            hideInUI = true
          }
        } else {
          hideInUI = !!chainInfo.hideInUI
        }

        return {
          ...chainInfo,
          hideInUI,
        }
      })
    )
  }
}
