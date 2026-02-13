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
  SelectSchema = 'SelectSchema',
  IssueNewCredential = 'IssueNewCredential',
  CredentialOffer = 'CredentialOffer',
  PresentationRequest = 'PresentationRequest',
}

export const totalPreparationSteps = 2;

const SelectSchemaStep = {
  title: i18next.t('Flow.titles.selectSchema'),
  name: DemoSteps.SelectSchema,
  next: {
    name: DemoSteps.IssueNewCredential,
  },
};

const FillCredentialStep = {
  title: i18next.t('Flow.titles.fillCredential'),
  name: DemoSteps.IssueNewCredential,
  prev: {
    name: DemoSteps.SelectSchema,
  },
  next: {
    title: i18next.t('Flow.buttons.issue'),
    name: DemoSteps.CredentialOffer,
  },
};

const CredentialOfferStep = {
  title: i18next.t('Flow.titles.credentialOffer'),
  name: DemoSteps.CredentialOffer,
  next: {
    name: DemoSteps.PresentationRequest,
    title: i18next.t('Flow.titles.verify'),
  },
};

const VerificationRequestStep = {
  title: i18next.t('Flow.titles.verificationRequest'),
  name: DemoSteps.PresentationRequest,
  next: {
    title: i18next.t('Flow.buttons.startAgain'),
    name: DemoSteps.SelectSchema,
  },
};

export const steps: Array<StepDetails<DemoContext>> = [
  SelectSchemaStep,
  FillCredentialStep,
  CredentialOfferStep,
  VerificationRequestStep,
];
