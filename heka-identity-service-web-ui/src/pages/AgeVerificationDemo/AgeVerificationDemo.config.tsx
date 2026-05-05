import { WizardContext } from '@/app/types/WizardContext';
import { StepDetails } from '@/components/Steps/Step.types';
import { Schema, ProtocolType } from '@/entities/Schema';
import { CredentialFormat } from '@/entities/Schema/model/types/schema';
import i18next from '@/translations';

export interface DemoContext extends WizardContext {
  protocolType: ProtocolType;
  credentialType: CredentialFormat;
  did: string;
  network?: string;
  schema?: Schema;
  attributes?: Array<string>;
}

export enum DemoSteps {
  IssueNewCredential = 'IssueNewCredential',
  CredentialOffer = 'CredentialOffer',
  RequestFieldsVerification = 'RequestFieldsVerification',
  PresentationRequest = 'PresentationRequest',
}

export const totalPreparationSteps = 1;

const FillCredentialStep = {
  title: i18next.t('Flow.titles.fillCredential'),
  name: DemoSteps.IssueNewCredential,
  next: {
    title: i18next.t('Flow.buttons.issue'),
    name: DemoSteps.CredentialOffer,
  },
};

const CredentialOfferStep = {
  title: i18next.t('Flow.titles.credentialOffer'),
  name: DemoSteps.CredentialOffer,
  next: {
    title: i18next.t('Flow.titles.verify'),
    name: DemoSteps.RequestFieldsVerification,
  },
};

const RequestFieldsVerificationStep = {
  title: i18next.t('Flow.titles.requestFieldsVerification'),
  name: DemoSteps.RequestFieldsVerification,
  next: {
    title: i18next.t('Flow.buttons.request'),
    name: DemoSteps.PresentationRequest,
  },
};

const VerificationRequestStep = {
  title: i18next.t('Flow.titles.verificationRequest'),
  name: DemoSteps.PresentationRequest,
  next: {
    title: i18next.t('Flow.buttons.startAgain'),
    name: DemoSteps.IssueNewCredential,
  },
};

export const steps: Array<StepDetails<DemoContext>> = [
  FillCredentialStep,
  CredentialOfferStep,
  RequestFieldsVerificationStep,
  VerificationRequestStep,
];
