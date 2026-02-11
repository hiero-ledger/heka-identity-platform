import { KeyType } from '@credo-ts/core'
import { KeplrConfig } from '@heka-wallet/keplr'
import { Config } from 'react-native-config'
import { Passkey } from 'react-native-passkey'

import { IndyBesuConfig } from './indy-besu'
import { OAuthStoreConfig } from './stores/OAuthStore'
import { PublicDidKeyOptions } from './utils/agent'

export const isKeplrIntegrationEnabled = Config.ENABLE_KEPLR_INTEGRATION === 'true'

export const isExternalAuthEnabled = Config.ENABLE_EXTERNAL_AUTH === 'true'

export const isWalletBackupEnabled = Config.ENABLE_WALLET_BACKUP === 'true' && Passkey.isSupported()

// TODO: Consider adding explicit warning for user
if (!Passkey.isSupported()) {
  console.warn('Wallet backup feature is not supported on current device')
}

export const walletProviderURL = Config.WALLET_PROVIDER_URL ?? 'https://backup.ssi-agency.dsr-corporation.com/api/v1'

export const agencyProviderURL = Config.AGENCY_PROVIDER_URL ?? 'https://api.ssi-agency.dsr-corporation.com'

export const publicDidKeyOptions: PublicDidKeyOptions = Config.PUBLIC_DID_KEY_OPTIONS
  ? JSON.parse(Config.PUBLIC_DID_KEY_OPTIONS)
  : {
      keyType: KeyType.P256,
      useJwkJcsPub: true,
    }

export const indyBesuConfig: IndyBesuConfig = {
  didRegistryContractAddress:
    Config.INDY_BESU_DID_REGISTRY_CONTRACT_ADDRESS ?? '0x0000000000000000000000000000000000003333',
  schemaRegistryContractAddress:
    Config.INDY_BESU_SCHEMA_REGISTRY_CONTRACT_ADDRESS ?? '0x0000000000000000000000000000000000005555',
  credentialDefinitionRegistryContractAddress:
    Config.INDY_BESU_CRED_DEF_REGISTRY_CONTRACT_ADDRESS ?? '0x0000000000000000000000000000000000004444',
  rpcUrl: Config.INDY_BESU_RPC_URL ?? 'http://192.168.1.145:8545/',
  signerPrivateKey:
    Config.INDY_BESU_SIGNER_PRIVATE_KEY ?? 'c87509a1c067bbde78beb793e6fa76530b6382a4c0241e5e4a9ec0a0f44dc0d3',
}

export const oauthStoreConfig: OAuthStoreConfig = Config.OAUTH_STORE_CONFIG
  ? JSON.parse(Config.OAUTH_STORE_CONFIG)
  : {
      oauthConfig: {
        clientId: '40508842-eb3f-4b64-9f77-90e45f18a4e5',
        redirectUrl: 'com.hiero.wallet.auth:/oauthredirect',
        scopes: ['basic_info'],
        clientAuthMethod: 'post',
        serviceConfiguration: {
          authorizationEndpoint: 'default-authorization-endpoint',
          tokenEndpoint: 'default-token-endpoint',
          revocationEndpoint: 'default-revocation-endpoint',
        },
      },
      userInfoEndpoint: 'default-user-info-endpoint',
      accountDeletionURL: 'default-account-deletion-url',
    }

export const keplrConfig: KeplrConfig = {
  embeddedChains: [
    {
      // Chain ID.
      chainId: 'osmo-test-5',
      // The name of the chain to be displayed to the user.
      chainName: 'Osmosis Testnet',
      // RPC endpoint of the chain. In this case we are using blockapsis, as it's accepts connections from any host currently. No Cors limitations.
      rpc: 'https://rpc.osmotest5.osmosis.zone',
      // REST endpoint of the chain.
      rest: 'https://lcd.osmotest5.osmosis.zone',
      // Staking coin information
      stakeCurrency: {
        // Coin denomination to be displayed to the user.
        coinDenom: 'OSMO',
        // Actual denom (i.e. uatom, uscrt) used by the blockchain.
        coinMinimalDenom: 'uosmo',
        // # of decimal points to convert minimal denomination to user-facing denomination.
        coinDecimals: 6,
        // (Optional) Keplr can show the fiat value of the coin if a coingecko id is provided.
        // You can get id from https://api.coingecko.com/api/v3/coins/list if it is listed.
        // coinGeckoId: ""
      },
      // (Optional) If you have a wallet webpage used to stake the coin then provide the url to the website in `walletUrlForStaking`.
      // The 'stake' button in Keplr extension will link to the webpage.
      // walletUrlForStaking: "",
      // The BIP44 path.
      bip44: {
        // You can only set the coin type of BIP44.
        // 'Purpose' is fixed to 44.
        coinType: 118,
      },
      // Bech32 configuration to show the address to user.
      bech32Config: {
        bech32PrefixAccAddr: 'osmo',
        bech32PrefixAccPub: 'osmopub',
        bech32PrefixValAddr: 'osmovaloper',
        bech32PrefixValPub: 'osmovaloperpub',
        bech32PrefixConsAddr: 'osmovalcons',
        bech32PrefixConsPub: 'osmovalconspub',
      },
      // List of all coin/tokens used in this chain.
      currencies: [
        {
          // Coin denomination to be displayed to the user.
          coinDenom: 'OSMO',
          // Actual denom (i.e. uatom, uscrt) used by the blockchain.
          coinMinimalDenom: 'uosmo',
          // # of decimal points to convert minimal denomination to user-facing denomination.
          coinDecimals: 6,
          // (Optional) Keplr can show the fiat value of the coin if a coingecko id is provided.
          // You can get id from https://api.coingecko.com/api/v3/coins/list if it is listed.
          // coinGeckoId: ""
        },
      ],
      // List of coin/tokens used as a fee token in this chain.
      feeCurrencies: [
        {
          // Coin denomination to be displayed to the user.
          coinDenom: 'OSMO',
          // Actual denom (i.e. uosmo, uscrt) used by the blockchain.
          coinMinimalDenom: 'uosmo',
          // # of decimal points to convert minimal denomination to user-facing denomination.
          coinDecimals: 6,
          // (Optional) Keplr can show the fiat value of the coin if a coingecko id is provided.
          // You can get id from https://api.coingecko.com/api/v3/coins/list if it is listed.
          // coinGeckoId: ""
          // (Optional) This is used to set the fee of the transaction.
          // If this field is not provided and suggesting chain is not natively integrated, Keplr extension will set the Keplr default gas price (low: 0.01, average: 0.025, high: 0.04).
          // Currently, Keplr doesn't support dynamic calculation of the gas prices based on on-chain data.
          // Make sure that the gas prices are higher than the minimum gas prices accepted by chain validators and RPC/REST endpoint.
          gasPriceStep: {
            low: 0.0025,
            average: 0.025,
            high: 0.04,
          },
        },
      ],
    },
  ],
}

export const fallbackDisplay = {
  credential: {
    logo: 'data:image/jpeg;base64,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',
    color: '#f58529',
  },
  issuer: {
    logo: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAHgAAAB4CAYAAAA5ZDbSAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAKSSURBVHgB7d27alRRFIDhNUGMFwgIdj6BXbp5CSt7cV7A2AipRVu1Fu2EVF7adIIvECttbAMBO40YVDLOAVfhEMJEz2Xv//x/dfoPzmXvzTqT+f7ePAzbWhg6geEJDE9geALDExiewPAEhicwPIHhCQxPYHgCwxMYnsDwBIYnMDyB4QkMT2B4AsMTGJ7A8ASGJzA8geEJ3GNfvh5G3wncQw3so6cvYnrjVvTdubDOamCf7byJ5zuvF9ffYogE7qASYDOBW6wk2EzgFioRNhP4PyoZNhP4H6oBNhP4DNUEmwm8QjXCZgKfUs2wmcAnRIDNBF6qWVIkwGYCL/V4AUzKzQZ4AsMTGJ7A8ASGJzA8geEJDE9geALDExiea9F/Oj74ED/evwpaowdO2OODj0FstMB02Gx0wGOBzUYDPDbYDA88VtgMCzx22AwHLOzfYYCFPbnqgYU9vWqBhV2t6oCFPVvVAR/tPgxbPXeT4AkMT2B4AhdS8/J4tPsg2s4N/4GbH36On4uvgl+f3kUXCTxQXcNmAvdcX7CZwD11bWMttqaX4/vLu9FnAndcwt68vh5DJHBHDQ2bCdxyG+uTuDO9FLPNi1FC1QDnzOXtq1FkDeztBeps88LiupzlheKBl0cabW+VJVwqbFYscOmzqkqHzYoDFrbdigEWtpsGBxa22wYDFrafegcWtt96A65lguvb2RUEbNY5cG2jeUm4TZ0Bk2Yu11zrwMKWVevAzf/5hC2n1h844paVpyrhCQyv9Wfwk/v3osvOD3xCorYm8/29eRg2b9HwBIYnMDyB4QkMT2B4AsMTGJ7A8ASGJzA8geEJDE9geALDExiewPAEhicwPIHhCQxPYHgCwxMYnsDwBIb3G3ICf7ke4NwgAAAAAElFTkSuQmCC',
    color: '#ffffff',
  },
}
