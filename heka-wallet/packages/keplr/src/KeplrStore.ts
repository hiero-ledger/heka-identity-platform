import { ToastType } from '@hyperledger/aries-bifold-core'
import { ChainInfoWithCoreTypes, init, ScryptParams } from '@keplr-wallet/background'
import { Keplr } from '@keplr-wallet/provider'
import { APP_PORT, BACKGROUND_PORT } from '@keplr-wallet/router'
import {
  AccountStore,
  ChainSuggestStore,
  CoinGeckoPriceStore,
  CosmosAccount,
  CosmosQueries,
  CosmwasmAccount,
  CosmwasmQueries,
  IBCCurrencyRegsitrar,
  InteractionStore,
  KeyRingStore,
  LedgerInitStore,
  PermissionStore,
  QueriesStore,
  SecretAccount,
  SecretQueries,
  SignInteractionStore,
  TokensStore,
} from '@keplr-wallet/stores'
import TransportBLE from '@ledgerhq/react-native-hw-transport-ble'
import { Buffer } from 'buffer'
import EventEmitter from 'eventemitter3'
import crypto from 'react-native-quick-crypto'
import scrypt from 'react-native-scrypt'
import Toast from 'react-native-toast-message'

import {
  AsyncKVStore,
  RNEnv,
  RNMessageRequesterInternal,
  RNMessageRequesterInternalToUI,
  RNRouterBackground,
  RNRouterUI,
} from './common'
import {
  AppChainInfo,
  CommunityChainSource,
  defaultCommunityChainsSource,
  defaultSupportedVsCurrencies,
  SupportedVsCurrencies,
} from './config'
import { ChainStore, KeyChainStore, WalletConnectStore } from './stores'
import { getLastUsedLedgerDeviceId, setLastUsedLedgerDeviceId } from './utils/ledger'

export interface KeplrConfig {
  embeddedChains: AppChainInfo[]
  communityChainsSource?: CommunityChainSource
  supportedVsCurrencies?: SupportedVsCurrencies
}

export class KeplrStore {
  public readonly chainStore: ChainStore
  public readonly keyRingStore: KeyRingStore

  protected readonly interactionStore: InteractionStore
  public readonly permissionStore: PermissionStore
  public readonly ledgerInitStore: LedgerInitStore
  public readonly signInteractionStore: SignInteractionStore
  public readonly chainSuggestStore: ChainSuggestStore

  public readonly queriesStore: QueriesStore<[CosmosQueries, CosmwasmQueries, SecretQueries]>
  public readonly accountStore: AccountStore<[CosmosAccount, CosmwasmAccount, SecretAccount]>
  public readonly priceStore: CoinGeckoPriceStore
  public readonly tokensStore: TokensStore<ChainInfoWithCoreTypes>

  protected readonly ibcCurrencyRegistrar: IBCCurrencyRegsitrar<ChainInfoWithCoreTypes>

  public readonly keychainStore: KeyChainStore
  public readonly walletConnectStore: WalletConnectStore

  private readonly _backgroundRouter: RNRouterBackground = new RNRouterBackground(RNEnv.produceEnv)

  public constructor(private readonly _config: KeplrConfig) {
    this.initializeKeplr()

    const router = new RNRouterUI(RNEnv.produceEnv)

    const eventEmitter = new EventEmitter()

    // Order is important.
    this.interactionStore = new InteractionStore(router, new RNMessageRequesterInternal())
    this.permissionStore = new PermissionStore(this.interactionStore, new RNMessageRequesterInternal())
    this.ledgerInitStore = new LedgerInitStore(this.interactionStore, new RNMessageRequesterInternal())
    this.signInteractionStore = new SignInteractionStore(this.interactionStore)
    this.chainSuggestStore = new ChainSuggestStore(
      this.interactionStore,
      this._config.communityChainsSource ?? defaultCommunityChainsSource
    )

    this.chainStore = new ChainStore(
      this._config.embeddedChains,
      new RNMessageRequesterInternal(),
      new AsyncKVStore('store_chains')
    )

    this.keyRingStore = new KeyRingStore(
      {
        dispatchEvent: (type: string) => {
          eventEmitter.emit(type)
        },
      },
      'pbkdf2',
      this.chainStore,
      new RNMessageRequesterInternal(),
      this.interactionStore
    )

    this.queriesStore = new QueriesStore(
      // Fix prefix key because there was a problem with storage being corrupted.
      // In the case of storage where the prefix key is "store_queries" or "store_queries_fix", "store_queries_fix2",
      // we should not use it because it is already corrupted in some users.
      // https://github.com/chainapsis/keplr-wallet/issues/275
      // https://github.com/chainapsis/keplr-wallet/issues/278
      // https://github.com/chainapsis/keplr-wallet/issues/318
      new AsyncKVStore('store_queries'),
      this.chainStore,
      CosmosQueries.use(),
      CosmwasmQueries.use(),
      SecretQueries.use({
        apiGetter: async () => {
          // TOOD: Set version for Keplr API
          return new Keplr('', 'core', new RNMessageRequesterInternal())
        },
      })
    )

    this.accountStore = new AccountStore(
      {
        addEventListener: (type: string, fn: () => void) => {
          eventEmitter.addListener(type, fn)
        },
        removeEventListener: (type: string, fn: () => void) => {
          eventEmitter.removeListener(type, fn)
        },
      },
      this.chainStore,
      () => {
        return {
          suggestChain: false,
          autoInit: true,
          getKeplr: async () => {
            // TOOD: Set version for Keplr API
            return new Keplr('', 'core', new RNMessageRequesterInternal())
          },
        }
      },
      CosmosAccount.use({
        queriesStore: this.queriesStore,
      }),
      CosmwasmAccount.use({
        queriesStore: this.queriesStore,
      }),
      SecretAccount.use({
        queriesStore: this.queriesStore,
      })
    )

    this.priceStore = new CoinGeckoPriceStore(
      new AsyncKVStore('store_prices'),
      this._config.supportedVsCurrencies ?? defaultSupportedVsCurrencies,
      'usd'
    )

    this.tokensStore = new TokensStore(
      {
        addEventListener: (type: string, fn: () => void) => {
          eventEmitter.addListener(type, fn)
        },
      },
      this.chainStore,
      new RNMessageRequesterInternal(),
      this.interactionStore
    )

    this.ibcCurrencyRegistrar = new IBCCurrencyRegsitrar<ChainInfoWithCoreTypes>(
      new AsyncKVStore('store_test_ibc_currency_registrar'),
      24 * 3600 * 1000,
      this.chainStore,
      this.accountStore,
      this.queriesStore,
      this.queriesStore
    )

    router.listen(APP_PORT)

    this.keychainStore = new KeyChainStore(new AsyncKVStore('store_keychain'), this.keyRingStore)

    this.walletConnectStore = new WalletConnectStore(
      new AsyncKVStore('store_wallet_connect'),
      {
        addEventListener: (type: string, fn: () => void) => {
          eventEmitter.addListener(type, fn)
        },
        removeEventListener: (type: string, fn: () => void) => {
          eventEmitter.removeListener(type, fn)
        },
      },
      this.chainStore,
      this.keyRingStore,
      this.permissionStore
    )
  }

  private initializeKeplr() {
    init(
      this._backgroundRouter,
      (prefix: string) => new AsyncKVStore(prefix),
      new RNMessageRequesterInternalToUI(),
      this._config.embeddedChains,
      [],
      [],
      this._config.communityChainsSource ?? defaultCommunityChainsSource,
      {
        //@ts-ignore
        rng: crypto.getRandomValues,
        scrypt: async (text: string, params: ScryptParams) => {
          const result = await scrypt(
            Buffer.from(text).toString('hex'),
            // Salt is expected to be encoded as Hex
            params.salt,
            params.n,
            params.r,
            params.p,
            params.dklen,
            'hex'
          )
          return Buffer.from(result)
        },
      },
      {
        create: ({ title, message }) => {
          Toast.show({
            type: ToastType.Info,
            text1: title,
            text2: message,
            position: 'bottom',
          })
          console.log(`Keplr notification: ${title}, ${message}`)
        },
      },
      {
        defaultMode: 'ble',
        transportIniters: {
          ble: async (deviceId?: string) => {
            const lastDeviceId = await getLastUsedLedgerDeviceId()

            if (!deviceId && !lastDeviceId) {
              throw new Error('Device id is empty')
            }

            if (!deviceId) {
              deviceId = lastDeviceId
            }

            if (deviceId && deviceId !== lastDeviceId) {
              await setLastUsedLedgerDeviceId(deviceId)
            }

            return await TransportBLE.open(deviceId)
          },
        },
      },
      {
        suggestChain: {
          useMemoryKVStore: true,
        },
      }
    )

    this._backgroundRouter.listen(BACKGROUND_PORT)

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    window.keplr = new Keplr('', new RNMessageRequesterInternal())
  }
}
