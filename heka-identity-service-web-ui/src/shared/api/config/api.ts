import { Mutex } from 'async-mutex';
import axios, { AxiosInstance, InternalAxiosRequestConfig } from 'axios';

import { authEndpoints } from '@/shared/api/config/endpoints';
import {
  clearTokens,
  getTokens,
  refreshTokens,
} from '@/shared/api/utils/token';

const mutex = new Mutex();

export const $agencyApi = axios.create({
  baseURL: `${process.env.REACT_APP_AGENCY_ENDPOINT}`,
});

export const $authApi = axios.create({
  baseURL: `${process.env.REACT_APP_AUTH_SERVICE_ENDPOINT}/api/v1`,
});

const setAuthHeader = (config: InternalAxiosRequestConfig) => {
  const { access } = getTokens();
  if (config.headers) {
    config.headers.Authorization = `Bearer ${access}`;
  }
  return config;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const handleApiError = async (api: AxiosInstance, error: any) => {
  try {
    const originalConfig = error.config;

    // If request failed with Unauthorized status and we have not tried to resend request yet
    if (error.response.status === 401) {
      if (
        originalConfig.url === authEndpoints.token ||
        originalConfig.url === authEndpoints.refresh ||
        originalConfig.url === authEndpoints.revoke
      ) {
        clearTokens();
        return Promise.reject(error);
      }

      if (!error.config._retry) {
        originalConfig._retry = true;
        // refresh access token
        const { accessToken } = await mutex.runExclusive(() =>
          refreshTokens($authApi),
        );
        // re-send request with new access token
        axios.defaults.headers.common['Authorization'] =
          `Bearer ${accessToken}`;
        return api(originalConfig);
      } else {
        clearTokens();
        return Promise.reject(error);
      }
    } else {
      return Promise.reject(error);
    }
  } catch {
    clearTokens();
    return Promise.reject(error);
  }
};

$authApi.interceptors.request.use(setAuthHeader);

$agencyApi.interceptors.request.use(setAuthHeader);

$authApi.interceptors.response.use(
  (response) => response,
  (error) => handleApiError($authApi, error),
);

$agencyApi.interceptors.response.use(
  (response) => response,
  (error) => handleApiError($agencyApi, error),
);
