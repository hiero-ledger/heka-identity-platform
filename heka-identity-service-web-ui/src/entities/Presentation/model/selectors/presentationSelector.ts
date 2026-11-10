import { StateSchema } from '@/app/providers/StoreProvider';
import {
  AnoncredsPresentationState,
  OpenIdPresentationState,
  PresentationFailureReason,
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

const SUCCESS_STATES: ReadonlyArray<string> = [
  AnoncredsPresentationState.PresentationReceived,
  AnoncredsPresentationState.Done,
  OpenIdPresentationState.ResponseVerified,
];

const FAILURE_STATES: ReadonlyArray<string> = [
  OpenIdPresentationState.Error,
  // DIDComm: a presentation that fails verification, or a problem report from the holder
  AnoncredsPresentationState.Abandoned,
  AnoncredsPresentationState.Declined,
];

/** The verifier received and accepted the presentation */
export const getIsPresentationCompleted = (state: StateSchema) => {
  const session = state.presentations.presentationSession;
  return (
    !!session &&
    SUCCESS_STATES.includes(session.state) &&
    session.isVerified !== false
  );
};

/** The verification ended without an accepted presentation */
export const getIsPresentationFailed = (state: StateSchema) => {
  const session = state.presentations.presentationSession;
  if (!session) return false;
  return (
    FAILURE_STATES.includes(session.state) ||
    (SUCCESS_STATES.includes(session.state) && session.isVerified === false)
  );
};

/** Nothing more will happen to the session: stop waiting for it */
export const getIsPresentationFinished = (state: StateSchema) =>
  getIsPresentationCompleted(state) || getIsPresentationFailed(state);

export const getPresentationFailureReason = (state: StateSchema) =>
  state.presentations.presentationSession?.failureReason ??
  PresentationFailureReason.Unknown;
