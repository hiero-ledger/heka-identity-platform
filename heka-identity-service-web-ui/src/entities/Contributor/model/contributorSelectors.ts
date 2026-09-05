import { StateSchema } from '@/app/providers/StoreProvider';

export const getContributorStep = (state: StateSchema) =>
  state.contributor?.currentStep ?? 0;

export const getContributorCompletedSteps = (state: StateSchema) =>
  state.contributor?.completedSteps ?? [];

export const getContributorGithubLinked = (state: StateSchema) =>
  state.contributor?.githubLinked ?? false;

export const getContributorGithubUsername = (state: StateSchema) =>
  state.contributor?.githubUsername ?? null;

export const getContributorActiveChallenge = (state: StateSchema) =>
  state.contributor?.activeChallenge ?? null;

export const getContributorBinding = (state: StateSchema) =>
  state.contributor?.binding ?? null;

export const getContributorCredentialIssued = (state: StateSchema) =>
  state.contributor?.credentialIssued ?? false;

export const getContributorIsLoading = (state: StateSchema) =>
  state.contributor?.isLoading ?? false;

export const getContributorError = (state: StateSchema) =>
  state.contributor?.error ?? null;
