/* eslint-disable @typescript-eslint/no-explicit-any */
import { Dispatch } from '@reduxjs/toolkit';
import toast from 'react-hot-toast';

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

/**
 * Shows the server's message and rejects the thunk with it. Session state is not touched
 * here: an expired session is renewed or dropped by the API layer, and the OIDC provider
 * mirrors the result into the user slice. The dispatch parameter is kept so existing
 * callers need no change.
 */
export const handleError = (
  error: Error,
  rejectWithValue: (message: string) => any,
  _dispatch?: Dispatch<any>,
) => {
  const apiErrorMessage =
    (error as ApiError).response?.data.message ?? 'Unknown server error';
  const message = errorMessage(apiErrorMessage);
  if (message) toast.error(message);

  return rejectWithValue(message);
};
