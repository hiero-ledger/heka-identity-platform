import { OAUTH_TOKEN_KEY, OAUTH_USER_INFO_KEY, OAuthStore, OAuthStoreConfig } from '../../src/stores/OAuthStore'
import Keychain, { UserCredentials } from 'react-native-keychain'
import moment from 'moment'
import { AuthorizeResult } from 'react-native-app-auth'
import { waitFor } from '@testing-library/react-native'
import { mockFunction } from '../../../jest-helpers/helpers'
import { getKeychainAccessOptions } from '../../src/utils/keychain'
import { WalletKeychainServices } from '../../src/types/keychain'
import Auth from 'react-native-app-auth'
import { UserInfo } from '../../src/types/auth'
import AsyncStorage from '@react-native-async-storage/async-storage'
import axios from 'axios'
import { Linking } from 'react-native'

const mockConfig: OAuthStoreConfig = {
  oauthConfig: {
    clientId: 'client-id',
    redirectUrl: 'redirect-url',
    scopes: ['basic_info'],
    clientAuthMethod: 'post',
    serviceConfiguration: {
      authorizationEndpoint: 'authorization-endpoint',
      tokenEndpoint: 'token-endpoint',
    },
  },
  userInfoEndpoint: 'user-info-endpoint',
  accountDeletionURL: 'account-deletion-url',
}

const mockAuthState: AuthorizeResult = {
  authorizationCode: 'authorization-code',
  accessTokenExpirationDate: moment().add(1, 'day').toISOString(),
  refreshToken: 'refresh-token',
  scopes: [],
  accessToken: 'access-token',
  idToken: 'null',
  tokenAdditionalParameters: {},
  tokenType: 'bearer',
  authorizeAdditionalParameters: {},
}

const expiredAuthState: AuthorizeResult = {
  ...mockAuthState,
  accessTokenExpirationDate: moment().add(-1, 'hours').toISOString(),
}

const refreshedAuthToken = 'refreshed-token'

jest.mock('react-native-app-auth', () => ({
  authorize: jest.fn(() => Promise.resolve(mockAuthState)),
  refresh: jest.fn(() => Promise.resolve({ ...mockAuthState, accessToken: refreshedAuthToken })),
  // Empty 'Promise.resolve()' is required for having 'then'/'catch'/'finally' properties in mock function
  revoke: jest.fn(() => Promise.resolve()),
}))

const mockUserInfo: UserInfo = {
  user_id: 'user-id',
  name: 'name',
  email: 'test@test.com',
}

const mockUserInfoStored = { ...mockUserInfo, name: 'stored-name' }

const authKeychainOptions = getKeychainAccessOptions(WalletKeychainServices.OAuth)

// Just in case - it may look like we can just put this in 'beforeEach' callback, but we don't want to do that
// OAuthStore is a MobX store with async initialization (and it potentially will run other reactive side effects)
// In this case, we want to be able to update mocks before init that will be called in constructor
async function createAndInitializeStore(): Promise<OAuthStore> {
  const oauthStore = new OAuthStore(mockConfig)
  await waitFor(() => expect(oauthStore.isLoading).toBe(false))
  return oauthStore
}

describe('OAuthStore', () => {
  beforeAll(() => {
    mockFunction(Keychain.getGenericPassword).mockResolvedValue({
      password: JSON.stringify(mockAuthState),
    } as UserCredentials)
  })

  it('should provide loading state', async () => {
    const oauthStore = new OAuthStore(mockConfig)
    expect(oauthStore.isLoading).toBe(true)
    await waitFor(() => expect(oauthStore.isLoading).toBe(false))
  })

  it('should initialize with empty auth state', async () => {
    mockFunction(Keychain.getGenericPassword).mockResolvedValueOnce(false)

    const oauthStore = await createAndInitializeStore()

    expect(oauthStore.isLoggedIn).toBe(false)
  })

  it('should load auth state and user info on initialization', async () => {
    const oauthStore = await createAndInitializeStore()

    expect(oauthStore.isLoggedIn).toBe(true)
    expect(Keychain.getGenericPassword).toBeCalledTimes(1)
    expect(Keychain.getGenericPassword).toBeCalledWith(authKeychainOptions)

    expect(AsyncStorage.getItem).toBeCalledTimes(1)
    expect(AsyncStorage.getItem).toBeCalledWith(OAUTH_USER_INFO_KEY)
  })

  it('should log in and save auth state to Keychain', async () => {
    mockFunction(Keychain.getGenericPassword).mockResolvedValueOnce(false)

    const oauthStore = await createAndInitializeStore()

    expect(oauthStore.isLoggedIn).toBe(false)

    await oauthStore.logIn()

    expect(oauthStore.isLoggedIn).toBe(true)

    expect(Auth.authorize).toBeCalledTimes(1)
    expect(Auth.authorize).toBeCalledWith(mockConfig.oauthConfig)

    expect(Keychain.setGenericPassword).toBeCalledTimes(1)
    expect(Keychain.setGenericPassword).toBeCalledWith(
      OAUTH_TOKEN_KEY,
      JSON.stringify(mockAuthState),
      authKeychainOptions
    )
  })

  it('should log out, revoke access token and reset auth state', async () => {
    const oauthStore = await createAndInitializeStore()

    expect(oauthStore.isLoggedIn).toBe(true)

    await oauthStore.logOut()

    expect(oauthStore.isLoggedIn).toBe(false)

    expect(Auth.revoke).toBeCalledTimes(1)
    expect(Auth.revoke).toBeCalledWith(mockConfig.oauthConfig, {
      tokenToRevoke: mockAuthState.accessToken,
      includeBasicAuth: true,
      sendClientId: true,
    })

    expect(Keychain.resetGenericPassword).toBeCalledTimes(1)
    expect(Keychain.resetGenericPassword).toBeCalledWith(authKeychainOptions)

    expect(AsyncStorage.removeItem).toBeCalledTimes(1)
    expect(AsyncStorage.removeItem).toBeCalledWith(OAUTH_USER_INFO_KEY)
  })

  it('should log out and reset auth state if token revocation failed', async () => {
    mockFunction(Auth.revoke).mockRejectedValueOnce(new Error())

    const oauthStore = await createAndInitializeStore()

    expect(oauthStore.isLoggedIn).toBe(true)

    await oauthStore.logOut()

    expect(oauthStore.isLoggedIn).toBe(false)

    expect(Keychain.resetGenericPassword).toBeCalledTimes(1)
    expect(Keychain.resetGenericPassword).toBeCalledWith(authKeychainOptions)

    expect(AsyncStorage.removeItem).toBeCalledTimes(1)
    expect(AsyncStorage.removeItem).toBeCalledWith(OAUTH_USER_INFO_KEY)
  })

  it('should throw error on log out attempt if not logged in', async () => {
    mockFunction(Keychain.getGenericPassword).mockResolvedValueOnce(false)

    const oauthStore = await createAndInitializeStore()

    await expect(oauthStore.logOut()).rejects.toThrow()
  })

  it('should open external link for account deletion', async () => {
    const oauthStore = await createAndInitializeStore()

    await oauthStore.openAccountDeletionPage()

    expect(Linking.openURL).toBeCalledTimes(1)
    expect(Linking.openURL).toBeCalledWith(mockConfig.accountDeletionURL)
  })

  it('should return access token from auth state', async () => {
    const oauthStore = await createAndInitializeStore()

    const accessToken = await oauthStore.getAccessToken()

    expect(accessToken).toBe(mockAuthState.accessToken)
  })

  it('should fall back to logging in if auth state is empty', async () => {
    mockFunction(Keychain.getGenericPassword).mockResolvedValueOnce(false)

    const oauthStore = await createAndInitializeStore()

    expect(oauthStore.isLoggedIn).toBe(false)

    const accessToken = await oauthStore.getAccessToken()
    expect(accessToken).toBe(mockAuthState.accessToken)

    expect(oauthStore.isLoggedIn).toBe(true)

    expect(Auth.authorize).toBeCalledTimes(1)
    expect(Auth.authorize).toBeCalledWith(mockConfig.oauthConfig)
  })

  it('should provide user info fetched from user_info endpoint', async () => {
    mockFunction(axios.get).mockResolvedValueOnce({ data: mockUserInfo })

    const oauthStore = await createAndInitializeStore()

    const userInfo = await oauthStore.getUserInfo()
    expect(userInfo).toEqual(mockUserInfo)

    expect(axios.get).toBeCalledTimes(1)
    expect(axios.get).toBeCalledWith(mockConfig.userInfoEndpoint, {
      headers: { Authorization: `Bearer ${mockAuthState.accessToken}` },
    })
  })

  it('should provide user info from storage if user_info endpoint fetch failed', async () => {
    mockFunction(axios.get).mockRejectedValueOnce(new Error())
    mockFunction(AsyncStorage.getItem).mockResolvedValue(JSON.stringify(mockUserInfoStored))

    const oauthStore = await createAndInitializeStore()

    const userInfo = await oauthStore.getUserInfo()
    expect(userInfo).toEqual(mockUserInfoStored)

    expect(axios.get).toBeCalledTimes(1)
    expect(axios.get).toBeCalledWith(mockConfig.userInfoEndpoint, {
      headers: { Authorization: `Bearer ${mockAuthState.accessToken}` },
    })

    expect(AsyncStorage.getItem).toBeCalledTimes(1)
    expect(AsyncStorage.getItem).toBeCalledWith(OAUTH_USER_INFO_KEY)
  })

  it('should refresh token', async () => {
    const oauthStore = await createAndInitializeStore()

    const accessToken = await oauthStore.getAccessToken()
    expect(accessToken).toBe(mockAuthState.accessToken)

    await oauthStore.refreshToken()

    const refreshedToken = await oauthStore.getAccessToken()
    expect(refreshedToken).toBe(refreshedAuthToken)

    expect(Auth.refresh).toBeCalledTimes(1)
    expect(Auth.refresh).toBeCalledWith(mockConfig.oauthConfig, { refreshToken: mockAuthState.refreshToken })
  })

  it('should throw error on refresh attempt if refresh token is not defined', async () => {
    mockFunction(Keychain.getGenericPassword).mockResolvedValueOnce({
      password: JSON.stringify({ ...mockAuthState, refreshToken: null }),
    } as UserCredentials)

    const oauthStore = await createAndInitializeStore()

    await expect(oauthStore.refreshToken()).rejects.toThrow()
  })

  it('should auto refresh on attempt to get access token if expired', async () => {
    mockFunction(Keychain.getGenericPassword).mockResolvedValueOnce({
      password: JSON.stringify(expiredAuthState),
    } as UserCredentials)
    mockFunction(Auth.refresh).mockResolvedValueOnce({
      ...mockAuthState,
      accessToken: refreshedAuthToken,
    })

    const oauthStore = await createAndInitializeStore()

    const accessToken = await oauthStore.getAccessToken()
    expect(accessToken).toBe(refreshedAuthToken)

    expect(Auth.refresh).toBeCalledTimes(1)
    expect(Auth.refresh).toBeCalledWith(mockConfig.oauthConfig, { refreshToken: mockAuthState.refreshToken })
  })

  it('should fall back to logging in if auto refresh failed', async () => {
    mockFunction(Keychain.getGenericPassword).mockResolvedValueOnce({
      password: JSON.stringify(expiredAuthState),
    } as UserCredentials)
    mockFunction(Auth.refresh).mockRejectedValueOnce(new Error())
    mockFunction(Auth.authorize).mockResolvedValueOnce({
      ...mockAuthState,
      accessToken: refreshedAuthToken,
    })

    const oauthStore = await createAndInitializeStore()

    const accessToken = await oauthStore.getAccessToken()
    expect(accessToken).toBe(refreshedAuthToken)

    expect(Auth.refresh).toBeCalledTimes(1)
    expect(Auth.refresh).toBeCalledWith(mockConfig.oauthConfig, { refreshToken: mockAuthState.refreshToken })

    expect(Auth.authorize).toBeCalledTimes(1)
    expect(Auth.authorize).toBeCalledWith(mockConfig.oauthConfig)
  })
})
