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
