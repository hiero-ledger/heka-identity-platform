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

/**
 * Handles API errors with proper error logging and token refresh logic
 * @param api - The Axios instance to use for retrying requests
 * @param error - The error object from the failed request
 * @returns Promise that resolves with retry response or rejects with error
 */
const handleApiError = async (api: AxiosInstance, error: unknown) => {
  // Type guard to check if error is an AxiosError
  if (!axios.isAxiosError(error)) {
    // Non-Axios error (e.g., network failure, timeout)
    console.error('[API] Unexpected error:', error);
    return Promise.reject(error);
  }

  // Check if error has a response (server responded with error status)
  if (!error.response) {
    // Network error or request was cancelled
    console.error('[API] Network error or request cancelled:', {
      message: error.message,
      code: error.code,
      url: error.config?.url,
    });
    return Promise.reject(error);
  }

  const originalConfig = error.config;

  // Ensure config exists
  if (!originalConfig) {
    console.error('[API] Missing request configuration');
    return Promise.reject(error);
  }

  try {
    // Handle 401 Unauthorized errors with token refresh logic
    if (error.response.status === 401) {
      // Don't retry auth endpoints to prevent infinite loops
      if (
        originalConfig.url === authEndpoints.token ||
        originalConfig.url === authEndpoints.refresh ||
        originalConfig.url === authEndpoints.revoke
      ) {
        console.warn('[API] Authentication failed on auth endpoint:', {
          url: originalConfig.url,
          status: error.response.status,
        });
        clearTokens();
        return Promise.reject(error);
      }

      // Check if we've already tried to refresh the token for this request
      if (!originalConfig._retry) {
        originalConfig._retry = true;

        // Use mutex to prevent multiple simultaneous refresh attempts
        const { accessToken } = await mutex.runExclusive(() =>
          refreshTokens($authApi),
        );

        // Update the authorization header with new token
        axios.defaults.headers.common['Authorization'] =
          `Bearer ${accessToken}`;

        // Retry the original request with new token
        return api(originalConfig);
      } else {
        // Already tried to refresh token, clear tokens and reject
        console.warn('[API] Token refresh already attempted, clearing tokens');
        clearTokens();
        return Promise.reject(error);
      }
    }

    // For non-401 errors, just reject
    console.error('[API] Request failed:', {
      url: originalConfig.url,
      method: originalConfig.method,
      status: error.response.status,
      statusText: error.response.statusText,
      data: error.response.data,
    });

    return Promise.reject(error);
  } catch (refreshError) {
    // Token refresh failed - don't log error details as they may contain sensitive data
    console.error('[API] Token refresh failed for request:', {
      url: originalConfig.url,
    });

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
