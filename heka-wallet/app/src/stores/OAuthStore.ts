import { GlobalLogger } from '@heka-wallet/shared'
import AsyncStorage from '@react-native-async-storage/async-storage'
import axios from 'axios'
import { makeAutoObservable, runInAction } from 'mobx'
import moment from 'moment'
import { Linking } from 'react-native'
import { AuthConfiguration, authorize, AuthorizeResult, refresh, revoke } from 'react-native-app-auth'
import * as Keychain from 'react-native-keychain'

import { UserInfo } from '../types/auth'
import { WalletKeychainServices } from '../types/keychain'
import { getKeychainAccessOptions } from '../utils/keychain'

export const OAUTH_TOKEN_KEY = 'OAuthToken'
export const OAUTH_USER_INFO_KEY = 'OAuthUserInfo'

export interface OAuthStoreConfig {
  oauthConfig: AuthConfiguration
  userInfoEndpoint: string
  accountDeletionURL: string
}

type AuthState = AuthorizeResult

const logger = GlobalLogger.createContextLogger('OAuth')

export class OAuthStore {
  protected static keychainOptions: Keychain.Options = getKeychainAccessOptions(WalletKeychainServices.OAuth)

  private _authState: AuthState | null = null
  private _userInfo: UserInfo | null = null
  private _isInitialized = false

  constructor(private readonly _config: OAuthStoreConfig) {
    // TODO: Find a proper way to remove '@ts-ignore' without making '_config' public
    // @ts-ignore
    makeAutoObservable(this, { _config: false })

    this.initialize()
  }

  get isLoading(): boolean {
    return !this._isInitialized
  }

  get isLoggedIn(): boolean {
    return !!this._authState
  }

  async getAccessToken(): Promise<string> {
    if (!this._authState) {
      await this.logIn()
    } else if (this.isTokenExpired) {
      await this.refreshToken().catch(async () => {
        logger.warn('Token refresh failed, falling back to login...')
        await this.logIn()
      })
    }

    return this._authState!.accessToken
  }

  async getUserInfo(): Promise<UserInfo> {
    await this.refreshUserInfo()

    if (!this._userInfo) {
      throw new Error('User info is empty')
    }

    return this._userInfo
  }

  async logIn(): Promise<void> {
    try {
      const state = await authorize(this._config.oauthConfig)
      logger.debug('Logged in with auth state:', state)

      await this.saveAuthState(state)
      await this.refreshUserInfo()
    } catch (error) {
      logger.error('Logging in failed with error:', error)
      throw error
    }
  }

  async refreshToken(): Promise<void> {
    if (!this._authState?.refreshToken) {
      throw new Error('Refresh token is empty')
    }

    try {
      const refreshResult = await refresh(this._config.oauthConfig, { refreshToken: this._authState.refreshToken })

      const state = {
        ...this._authState,
        ...refreshResult,
        refreshToken: refreshResult.refreshToken ?? this._authState.refreshToken,
      }

      await this.saveAuthState(state)
    } catch (error) {
      logger.error('Token refresh failed with error:', error)
      throw error
    }
  }

  async logOut(): Promise<void> {
    if (!this._authState) {
      throw new Error('Auth state is empty')
    }

    try {
      // We don't want to prevent user from logging out due to token revocation failure (including being offline), so we're catching possible error here.
      // TODO: Add background retry for failed network requests to revoke token when device is back online
      await revoke(this._config.oauthConfig, {
        tokenToRevoke: this._authState.accessToken,
        includeBasicAuth: true,
        sendClientId: true,
      }).catch((error) => logger.error('Access token revocation failed with error:', error))

      await this.resetAuthState()
      await this.resetUserInfo()

      logger.debug('Successfully logged out')
    } catch (error) {
      logger.error('Logging out failed with error:', error)
      throw error
    }
  }

  // TODO: Consider using embedded WebView for OAuth frontend interaction
  openAccountDeletionPage(): Promise<void> {
    return Linking.openURL(this._config.accountDeletionURL)
  }

  private async initialize(): Promise<void> {
    const keychainCredentials = await Keychain.getGenericPassword(OAuthStore.keychainOptions)
    if (keychainCredentials) {
      const authState = JSON.parse(keychainCredentials.password)
      logger.debug('Loaded auth state:', authState)

      runInAction(() => (this._authState = authState))
    }

    const userInfoData = await AsyncStorage.getItem(OAUTH_USER_INFO_KEY)
    if (userInfoData) {
      const userInfo = JSON.parse(userInfoData)
      logger.debug('Loaded user info:', userInfo)

      runInAction(() => (this._userInfo = userInfo))
    }

    runInAction(() => (this._isInitialized = true))
  }

  private get isTokenExpired(): boolean {
    if (!this._authState) {
      throw new Error('Auth state is empty')
    }
    return moment(this._authState.accessTokenExpirationDate).isBefore()
  }

  private async saveAuthState(state: AuthState): Promise<void> {
    await Keychain.setGenericPassword(OAUTH_TOKEN_KEY, JSON.stringify(state), OAuthStore.keychainOptions)
    runInAction(() => (this._authState = state))
  }

  private async resetAuthState(): Promise<void> {
    await Keychain.resetGenericPassword(OAuthStore.keychainOptions)
    runInAction(() => (this._authState = null))
  }

  private async refreshUserInfo(): Promise<void> {
    try {
      const accessToken = await this.getAccessToken()

      const { data: userInfo } = await axios.get<UserInfo>(this._config.userInfoEndpoint, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })

      await AsyncStorage.setItem(OAUTH_USER_INFO_KEY, JSON.stringify(userInfo))

      runInAction(() => (this._userInfo = userInfo))
    } catch (error) {
      logger.error('Refreshing user info failed with error:', error)
    }
  }

  private resetUserInfo(): Promise<void> {
    return AsyncStorage.removeItem(OAUTH_USER_INFO_KEY)
  }
}
