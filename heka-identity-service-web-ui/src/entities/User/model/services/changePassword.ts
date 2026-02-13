import { createAsyncThunk } from '@reduxjs/toolkit';

import { ThunkConfig } from '@/app/providers/StoreProvider';
import { ThunkExtraArg } from '@/app/providers/StoreProvider/config/StateSchema';
import { authEndpoints } from '@/shared/api/config/endpoints';
import { handleError } from '@/shared/api/utils/error';

export interface ChangePasswordParams {
  username: string;
  password: string;
  passwordRepeat: string;
  oldPassword: string;
}

const requestChangePassword = async (
  extra: ThunkExtraArg,
  username: string,
  oldPassword: string,
) => {
  try {
    return await extra.authApi.post(authEndpoints.requestChangePassword, {
      name: username,
      oldPassword: oldPassword,
    });
  } catch (error) {
    if (error.response && error.response.status === 401) {
      throw new Error('Current password is incorrect.');
    } else {
      throw error;
    }
  }
};

export const changePassword = createAsyncThunk<
  void,
  ChangePasswordParams,
  ThunkConfig<string>
>('user/changePassword', async (body, thunkAPI) => {
  const { extra, rejectWithValue, dispatch } = thunkAPI;

  try {
    const requestResetRes = await requestChangePassword(
      extra,
      body.username,
      body.oldPassword,
    );
    await extra.authApi.post(authEndpoints.changePassword, {
      password: body.password,
      token: requestResetRes.data.token,
    });
  } catch (error) {
    return handleError(error, rejectWithValue, dispatch);
  }
});
