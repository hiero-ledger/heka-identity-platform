import axios, { InternalAxiosRequestConfig } from 'axios';

import { getDemoAccessToken, invalidateDemoAccessToken } from './demoToken';

/**
 * Identity-service client for the public demo pages: authenticates with the demo-token broker's
 * short-lived token instead of the signed-in session, so the pages work without signing in.
 */
export const $agencyDemoApi = axios.create({
  baseURL: `${process.env.REACT_APP_AGENCY_ENDPOINT}`,
});

const setDemoAuthHeader = async (config: InternalAxiosRequestConfig) => {
  // A retry after a token refresh already carries the fresh token.
  if (config._retry && config.headers?.Authorization) return config;
  const token = await getDemoAccessToken();
  if (config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
};

/** Refreshes the demo token once when the identity service rejects it (e.g. expired mid-flight). */
const retryOnceWithFreshToken = async (error: unknown) => {
  if (
    axios.isAxiosError(error) &&
    error.response?.status === 401 &&
    error.config &&
    !error.config._retry
  ) {
    error.config._retry = true;
    invalidateDemoAccessToken();
    const token = await getDemoAccessToken();
    error.config.headers.Authorization = `Bearer ${token}`;
    return $agencyDemoApi(error.config);
  }
  return Promise.reject(error);
};

$agencyDemoApi.interceptors.request.use(setDemoAuthHeader);
$agencyDemoApi.interceptors.response.use(
  (response) => response,
  retryOnceWithFreshToken,
);
