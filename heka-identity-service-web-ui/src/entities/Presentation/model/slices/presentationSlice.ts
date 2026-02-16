import { PayloadAction } from '@reduxjs/toolkit';

import {
  updatePresentationState,
  CheckPresentationStateResult,
} from '@/entities/Presentation/model/services/updatePresentationState';
import { buildSlice } from '@/shared/lib/store';

import {
  requestPresentation,
  RequestPresentationResult,
} from '../services/requestPresentation';
import { PresentationSchema } from '../types/presentation';

const initialState: PresentationSchema = {
  isLoading: false,
  error: undefined,
  presentationSession: undefined,
};

export const presentationSlice = buildSlice({
  name: 'presentations',
  initialState,
  reducers: {
    reset: (state) => {
      state.isLoading = initialState.isLoading;
      state.error = initialState.error;
      state.presentationSession = initialState.presentationSession;
    },
  },
  extraReducers: (builder) =>
    builder
      .addCase(requestPresentation.pending, (state) => {
        state.isLoading = true;
        state.error = undefined;
        state.presentationSession = undefined;
      })
      .addCase(
        requestPresentation.fulfilled,
        (state, action: PayloadAction<RequestPresentationResult>) => {
          state.isLoading = false;
          state.error = undefined;
          state.presentationSession = action.payload;
        },
      )
      .addCase(requestPresentation.rejected, (state, payload) => {
        state.isLoading = false;
        state.error = payload.error.message;
        state.presentationSession = undefined;
      })
      .addCase(
        updatePresentationState.fulfilled,
        (state, action: PayloadAction<CheckPresentationStateResult>) => {
          if (state.presentationSession) {
            state.presentationSession.state = action.payload.state;
            state.presentationSession.sharedAttributes =
              action.payload.sharedAttributes;
          }
        },
      ),
});

export const {
  reducer: presentationReducer,
  actions: presentationActions,
  useActions: usePresentationActions,
} = presentationSlice;
