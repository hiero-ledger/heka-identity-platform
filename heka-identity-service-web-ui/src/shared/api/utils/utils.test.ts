import toast from 'react-hot-toast';

import { USER_ID } from '@/entities/User/model/const';
import { registerSessionBridge } from '@/shared/auth/sessionBridge';

import { ApiError, errorMessage, handleError } from './error';
import { clearUserId, getUserId, storeUserId } from './token';

jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: { error: jest.fn() },
}));

const apiError = (message?: string | string[]) =>
  ({
    name: 'AxiosError',
    message: 'Request failed',
    response: { status: 400, statusText: 'Bad Request', data: { message } },
  }) as ApiError;

describe('errorMessage', () => {
  test.each([
    ['plain', 'plain'],
    [['a', 'b'], 'a, b'],
    [[], ''],
  ])('%j -> %j', (input, expected) => {
    expect(errorMessage(input)).toBe(expected);
  });
});

describe('handleError', () => {
  test('toasts the server message and rejects with it', () => {
    const rejectWithValue = jest.fn((message: string) => ({
      rejected: message,
    }));

    const result = handleError(apiError(['too', 'short']), rejectWithValue);

    expect(toast.error).toHaveBeenCalledWith('too, short');
    expect(rejectWithValue).toHaveBeenCalledWith('too, short');
    expect(result).toEqual({ rejected: 'too, short' });
  });

  test('does not toast a 401 while nobody is signed in', () => {
    const rejectWithValue = jest.fn();
    const unauthorized = {
      ...apiError('Authorization token is missing'),
      response: {
        status: 401,
        statusText: 'Unauthorized',
        data: { message: 'Authorization token is missing' },
      },
    } as ApiError;

    handleError(unauthorized, rejectWithValue);

    expect(toast.error).not.toHaveBeenCalled();
    // The thunk is still rejected with the message
    expect(rejectWithValue).toHaveBeenCalledWith(
      'Authorization token is missing',
    );
  });

  test('still toasts a 401 for a signed-in user', () => {
    registerSessionBridge({
      getAccessToken: () => 'token',
      refresh: jest.fn(),
      dropSession: jest.fn(),
      signOut: jest.fn(),
    });
    try {
      const unauthorized = {
        ...apiError('Access denied'),
        response: {
          status: 401,
          statusText: 'Unauthorized',
          data: { message: 'Access denied' },
        },
      } as ApiError;

      handleError(unauthorized, jest.fn());

      expect(toast.error).toHaveBeenCalledWith('Access denied');
    } finally {
      registerSessionBridge(null);
    }
  });

  test('falls back to a generic message when the server sends none', () => {
    const rejectWithValue = jest.fn();

    handleError(apiError(undefined), rejectWithValue);

    expect(rejectWithValue).toHaveBeenCalledWith('Unknown server error');
  });

  test('falls back to a generic message when the response has no body', () => {
    const rejectWithValue = jest.fn();

    handleError(
      { name: 'AxiosError', message: 'x', response: { status: 502 } } as Error,
      rejectWithValue,
    );

    expect(rejectWithValue).toHaveBeenCalledWith('Unknown server error');
  });

  test('keeps the message of a client-side error', () => {
    const rejectWithValue = jest.fn();

    handleError(new Error('Schema is not registered'), rejectWithValue);

    expect(toast.error).toHaveBeenCalledWith('Schema is not registered');
    expect(rejectWithValue).toHaveBeenCalledWith('Schema is not registered');
  });

  test('keeps the message of a request that got no response', () => {
    const rejectWithValue = jest.fn();
    const networkError = Object.assign(new Error('Network Error'), {
      isAxiosError: true,
    });

    handleError(networkError, rejectWithValue);

    expect(rejectWithValue).toHaveBeenCalledWith('Network Error');
  });

  test('falls back to a generic message for an error without a message', () => {
    const rejectWithValue = jest.fn();

    handleError(new Error(''), rejectWithValue);

    expect(rejectWithValue).toHaveBeenCalledWith('Unknown server error');
  });

  test('does not toast an empty message', () => {
    const rejectWithValue = jest.fn();

    handleError(apiError([]), rejectWithValue);

    expect(toast.error).not.toHaveBeenCalled();
    expect(rejectWithValue).toHaveBeenCalledWith('');
  });
});

describe('user id storage', () => {
  afterEach(() => localStorage.clear());

  test('stores, reads and clears the DID', () => {
    expect(getUserId()).toBeNull();

    storeUserId('did:key:1');
    expect(getUserId()).toBe('did:key:1');
    expect(localStorage.getItem(USER_ID)).toBe('did:key:1');

    clearUserId();
    expect(getUserId()).toBeNull();
  });
});
