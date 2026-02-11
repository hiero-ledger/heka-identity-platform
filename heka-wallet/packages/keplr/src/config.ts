import { ChainInfo } from '@keplr-wallet/types'

export interface AppChainInfo extends ChainInfo {
  readonly hideInUI?: boolean
  readonly txExplorer?: {
    readonly name: string
    readonly txUrl: string
  }
  readonly updateFromRepoDisabled?: boolean
}

export interface CommunityChainSource {
  organizationName: string
  repoName: string
  branchName: string
}

interface SupportedVsCurrency {
  currency: string
  symbol: string
  maxDecimals: number
  locale: string
}

export type SupportedVsCurrencies = Record<string, SupportedVsCurrency>

export const defaultSupportedVsCurrencies: SupportedVsCurrencies = {
  usd: {
    currency: 'usd',
    symbol: '$',
    maxDecimals: 2,
    locale: 'en-US',
  },
  eur: {
    currency: 'eur',
    symbol: '€',
    maxDecimals: 2,
    locale: 'de-DE',
  },
  gbp: {
    currency: 'gbp',
    symbol: '£',
    maxDecimals: 2,
    locale: 'en-GB',
  },
  cad: {
    currency: 'cad',
    symbol: 'CA$',
    maxDecimals: 2,
    locale: 'en-CA',
  },
  rub: {
    currency: 'rub',
    symbol: '₽',
    maxDecimals: 0,
    locale: 'ru',
  },
  krw: {
    currency: 'krw',
    symbol: '₩',
    maxDecimals: 0,
    locale: 'ko-KR',
  },
  hkd: {
    currency: 'hkd',
    symbol: 'HK$',
    maxDecimals: 1,
    locale: 'en-HK',
  },
  cny: {
    currency: 'cny',
    symbol: '¥',
    maxDecimals: 1,
    locale: 'zh-CN',
  },
  jpy: {
    currency: 'jpy',
    symbol: '¥',
    maxDecimals: 0,
    locale: 'ja-JP',
  },
}

export const defaultCommunityChainsSource: CommunityChainSource = {
  organizationName: 'chainapsis',
  repoName: 'keplr-chain-registry',
  branchName: 'main',
}
