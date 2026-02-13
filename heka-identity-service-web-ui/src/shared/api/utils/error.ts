import toast from 'react-hot-toast';
import { Dispatch } from 'redux';

import { signOut } from '@/entities/User/model/services/signOut';
import { getAccessToken } from '@/shared/api/utils/token';

export interface ApiError extends Error {
  message: string;
  response: {
    status: number;
    statusText: string;
    data: {
      message?: string | string[];
    };
  };
}

export const errorMessage = (error: string | string[]) =>
  Array.isArray(error) ? error.join(', ') : error;

export const handleError = (
  error: Error,
  // RejectWithValue type is not public
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rejectWithValue: (message: string) => any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dispatch?: Dispatch<any>,
) => {
  const apiErrorMessage =
    (error as ApiError).response?.data.message ?? 'Unknown server error';

  const message = errorMessage(apiErrorMessage);
  if (message) toast.error(message);

  const accessToken = getAccessToken();
  if (!accessToken) {
    // Do sign out if the access token was removed
    if (dispatch) dispatch(signOut());
  }

  return rejectWithValue(message);
};
