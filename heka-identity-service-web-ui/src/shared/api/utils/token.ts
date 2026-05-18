import { AxiosInstance } from 'axios';

import { demoUser } from '@/const/user';
import { Tokens } from '@/entities/User';
import {
  ACCESS_TOKEN_KEY,
  REFRESH_TOKEN_KEY,
  USER_ID,
} from '@/entities/User/model/const';
import { authEndpoints } from '@/shared/api/config/endpoints';

let inMemoryAccessToken: string | null = null;

export const storeTokens = (tokens: Tokens) => {
  if (tokens.accessToken) {
    inMemoryAccessToken = tokens.accessToken;
  }
  if (tokens.refreshToken) {
    sessionStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
  }
};

export const getAccessToken = () => {
  return inMemoryAccessToken;
};

export const getRefreshToken = () => {
  return sessionStorage.getItem(REFRESH_TOKEN_KEY);
};

export const getTokens = () => {
  return {
    access: getAccessToken() ?? demoUser.accessToken,
    refresh: getRefreshToken() ?? demoUser.refreshToken,
  };
};

export const clearTokens = () => {
  inMemoryAccessToken = null;
  sessionStorage.removeItem(REFRESH_TOKEN_KEY);
  sessionStorage.removeItem(USER_ID);
  localStorage.removeItem(USER_ID);
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
};

export const refreshTokens = async (api: AxiosInstance) => {
  const { access, refresh } = getTokens();

  if (access === demoUser.accessToken) {
    return { accessToken: access };
  }

  const response = await api.post(authEndpoints.refresh, { refresh });

  storeTokens({
    accessToken: response.data.access,
    refreshToken: response.data.refresh,
  });

  return {
    accessToken: response.data.access,
  };
};

export const storeUserId = (id: string) => {
  sessionStorage.setItem(USER_ID, id);
};

export const getUserId = () => {
  return sessionStorage.getItem(USER_ID);
};
