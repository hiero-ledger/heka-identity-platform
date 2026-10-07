import { USER_ID } from '@/entities/User/model/const';

/**
 * The user's DID is the only auth-related value the app keeps itself; access and refresh
 * tokens live in the OIDC client's session store (see `@/shared/auth`).
 */
export const storeUserId = (id: string) => {
  localStorage.setItem(USER_ID, id);
};

export const getUserId = () => {
  return localStorage.getItem(USER_ID);
};

export const clearUserId = () => {
  localStorage.removeItem(USER_ID);
};
