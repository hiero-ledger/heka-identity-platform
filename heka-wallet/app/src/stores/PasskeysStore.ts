import { GlobalLogger } from '@heka-wallet/shared'
import axios from 'axios'
import { makeAutoObservable, runInAction } from 'mobx'
import { Platform } from 'react-native'
import { Config } from 'react-native-config'
import { Passkey, PasskeyAuthenticationResult, PasskeyRegistrationResult } from 'react-native-passkey'
import { PasskeyAuthenticationRequest, PasskeyRegistrationRequest } from 'react-native-passkey/lib/typescript/Passkey'
import RNUserIdentity from 'react-native-user-identity'
import url from 'url'

interface PasskeyAuthResultWithExtensions extends PasskeyAuthenticationResult {
  clientExtensionResults: any
}

interface PasskeyRegistrationResultWithExtensions extends PasskeyRegistrationResult {
  clientExtensionResults: any
}

export type PasskeyAuthResult = PasskeyAuthResultWithExtensions | PasskeyRegistrationResultWithExtensions

const logger = GlobalLogger.createContextLogger('Passkeys')

export class PasskeysStore {
  private _prf: { value: string | null } | null = null
  private _user: string | null = null
  private _origin: string

  constructor(private readonly _authProviderUrl: string) {
    this._origin =
      Platform.OS === 'android'
        ? `android:apk-key-hash:-${Config.CERTIFICATE_HASH}` // Android: base64url encoded `sha256_cert_fingerprints`
        : `https://${url.parse(this._authProviderUrl).host}` // iOS: fully qualified origin of API requester (RP ID)

    makeAutoObservable(this)
  }

  async getUser() {
    if (this._user) {
      return this._user
    }
    const user = await RNUserIdentity.getUserId({})
    this._user = user ?? 'anonymous'
    return this._user
  }

  get isLoading(): boolean {
    return false
  }

  get isAuthenticated(): boolean {
    return !!this._prf
  }

  get isSupported(): boolean {
    return Passkey.isSupported()
  }

  get HMAC(): string {
    if (!this._prf?.value) {
      throw new Error('Auth result is empty')
    }

    return this._prf.value
  }

  async register(username: string): Promise<void> {
    try {
      const { data: registrationRequest } = await axios.post<PasskeyRegistrationRequest>(
        `${this._authProviderUrl}/webauthn/registration/challenge`,
        {
          name: username,
          displayName: username,
          origin: this._origin,
        }
      )

      const registrationResult = await Passkey.register(registrationRequest)
      logger.debug('Registered new account with result:', JSON.stringify(registrationResult))

      await axios.post(`${this._authProviderUrl}/webauthn/registration`, {
        ...registrationResult,
        challenge: registrationRequest.challenge,
      })

      runInAction(() => {
        this._prf = {
          value: this.extractPrf(registrationResult, registrationRequest),
        }
      })
    } catch (error) {
      logger.error('Registration is failed with error:', error)
      throw error
    }
  }

  async authenticate(username: string): Promise<void> {
    try {
      const { data: authRequest } = await axios.post<PasskeyAuthenticationRequest>(
        `${this._authProviderUrl}/webauthn/authentication/challenge`,
        {
          name: username,
          origin: this._origin,
        }
      )

      const authResult = await Passkey.authenticate(authRequest)
      logger.debug('Authenticated with result:', JSON.stringify(authResult))

      await axios.post(`${this._authProviderUrl}/webauthn/authentication`, {
        ...authResult,
        challenge: authRequest.challenge,
      })

      runInAction(() => {
        this._prf = {
          value: this.extractPrf(authResult, authRequest),
        }
      })
    } catch (error) {
      logger.error('Authentication is failed with error:', error)
      throw error
    }
  }

  private extractPrf(result: any, request: any) {
    // TODO: Use processed PRF value and properly handle cases where it's not available

    // On some devices `result` object does not contain client extensions,
    // so we have to work around by extracting it from the `request`
    // if (result.clientExtensionResults && result.clientExtensionResults.prf) {
    //   return result.clientExtensionResults.prf.results.first
    // }
    if (request.extensions?.prf) {
      return request.extensions.prf.eval.first
    }
    return null
  }
}
