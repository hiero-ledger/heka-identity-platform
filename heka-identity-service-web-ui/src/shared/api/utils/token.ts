import { AxiosInstance } from 'axios';

import { demoUser } from '@/const/user';
import { Tokens } from '@/entities/User';
import {
  ACCESS_TOKEN_KEY,
  REFRESH_TOKEN_KEY,
  USER_ID,
} from '@/entities/User/model/const';
import { authEndpoints } from '@/shared/api/config/endpoints';

export const storeTokens = (tokens: Tokens) => {
  if (tokens.accessToken)
    localStorage.setItem(ACCESS_TOKEN_KEY, tokens.accessToken);
  if (tokens.refreshToken)
    localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
};

export const getAccessToken = () => {
  return localStorage.getItem(ACCESS_TOKEN_KEY);
};

export const getRefreshToken = () => {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
};

export const getTokens = () => {
  return {
    access: getAccessToken() ?? demoUser.accessToken,
    refresh: getRefreshToken() ?? demoUser.refreshToken,
  };
};

export const clearTokens = () => {
  localStorage.removeItem(USER_ID);
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
};

export const refreshTokens = async (api: AxiosInstance) => {
  const { access, refresh } = getTokens();

  if (access === demoUser.accessToken) {
    // skip refreshing for demo user
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
  localStorage.setItem(USER_ID, id);
};

export const getUserId = () => {
  return localStorage.getItem(USER_ID);
};
