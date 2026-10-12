import { Mutex } from 'async-mutex';
import axios, { AxiosInstance, InternalAxiosRequestConfig } from 'axios';

import {
  dropSession,
  getSessionAccessToken,
  refreshSessionToken,
} from '@/shared/auth/sessionBridge';

const mutex = new Mutex();

export const $agencyApi = axios.create({
  baseURL: `${process.env.REACT_APP_AGENCY_ENDPOINT}`,
});

/**
 * Bearer token for identity-service calls: the signed-in OIDC session. The public demo pages
 * use the demo client instead (demoApi.ts), which authenticates with the demo-token broker.
 */
export const currentAccessToken = (): string | null => getSessionAccessToken();

const setAuthHeader = (config: InternalAxiosRequestConfig) => {
  // A retry after a token renewal already carries the fresh token.
  if (config._retry && config.headers?.Authorization) return config;
  const token = currentAccessToken();
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
};

/**
 * Handles API errors with proper error logging and session renewal on 401
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
    if (error.response.status === 401) {
      // Only a signed-in session can be renewed.
      if (!getSessionAccessToken()) {
        console.warn('[API] Unauthorized without a signed-in session:', {
          url: originalConfig.url,
        });
        return Promise.reject(error);
      }

      // Check if we've already tried to renew the session for this request
      if (!originalConfig._retry) {
        originalConfig._retry = true;

        // Use mutex to prevent multiple simultaneous renewals
        const accessToken = await mutex.runExclusive(() =>
          refreshSessionToken(),
        );

        if (accessToken) {
          originalConfig.headers.Authorization = `Bearer ${accessToken}`;
          return api(originalConfig);
        }

        console.warn('[API] Session renewal failed, dropping the session');
        await dropSession();
        return Promise.reject(error);
      }

      // Already tried to renew, drop the session and reject
      console.warn(
        '[API] Session renewal already attempted, dropping the session',
      );
      await dropSession();
      return Promise.reject(error);
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
  } catch {
    // Session renewal failed - don't log error details as they may contain sensitive data
    console.error('[API] Session renewal failed for request:', {
      url: originalConfig.url,
    });

    await dropSession();
    return Promise.reject(error);
  }
};

$agencyApi.interceptors.request.use(setAuthHeader);

$agencyApi.interceptors.response.use(
  (response) => response,
  (error) => handleApiError($agencyApi, error),
);
