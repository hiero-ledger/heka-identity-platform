import { StateSchema } from '@/app/providers/StoreProvider';
import {
  AnoncredsPresentationState,
  OpenIdPresentationState,
} from '@/entities/Presentation/model/types/presentation';

export const getPresentationRequestIsLoading = (state: StateSchema) =>
  state.presentations.isLoading;

export const getPresentationRequest = (state: StateSchema) =>
  state.presentations.presentationSession?.request;

export const getPresentationState = (state: StateSchema) =>
  state.presentations.presentationSession?.state;

export const getPresentationRequestId = (state: StateSchema) =>
  state.presentations.presentationSession?.id;

export const getPresentationSharedAttributes = (state: StateSchema) =>
  state.presentations.presentationSession?.sharedAttributes;

export const getIsPresentationCompleted = (state: StateSchema) => {
  const presentationState = state.presentations.presentationSession?.state;
  return (
    presentationState === AnoncredsPresentationState.PresentationReceived ||
    presentationState === AnoncredsPresentationState.Done ||
    presentationState === OpenIdPresentationState.ResponseVerified
  );
};
