import { WizardContext } from '@/app/types/WizardContext';
import { StepDetails } from '@/components/Steps/Step.types';
import { Schema } from '@/entities/Schema';
import {
  CredentialFormat,
  ProtocolType,
} from '@/entities/Schema/model/types/schema';
import i18next from '@/translations';

export interface VerifyCredentialContext extends WizardContext {
  protocolType?: ProtocolType;
  credentialType?: CredentialFormat;
  network?: string;
  schema?: Schema;
  attributes?: Array<string>;
  did?: string;
  templateId?: string;
  templateName?: string;
}

export const totalPreparationSteps = 4;

export enum VerifyCredentialSteps {
  SelectProtocolType = 'SelectProtocolType',
  SelectNetwork = 'SelectNetwork',
  SelectSchema = 'SelectSchema',
  PresentationRequest = 'PresentationRequest',
  RequestFieldsVerification = 'RequestFieldsVerification',
}

const SelectProtocolStep = {
  title: i18next.t('Flow.titles.selectProtocol'),
  name: VerifyCredentialSteps.SelectProtocolType,
  next: {
    name: (context?: VerifyCredentialContext) =>
      context?.protocolType === ProtocolType.Oid4vc
        ? VerifyCredentialSteps.SelectSchema
        : VerifyCredentialSteps.SelectNetwork,
  },
};

const SelectNetworkStep = {
  title: i18next.t('Flow.titles.selectNetwork'),
  name: VerifyCredentialSteps.SelectNetwork,
  prev: {
    name: VerifyCredentialSteps.SelectProtocolType,
  },
  next: {
    name: VerifyCredentialSteps.SelectSchema,
  },
};

const SelectSchemaStep = {
  title: i18next.t('Flow.titles.selectSchema'),
  name: VerifyCredentialSteps.SelectSchema,
  prev: {
    name: (context?: VerifyCredentialContext) =>
      context?.protocolType === ProtocolType.Oid4vc
        ? VerifyCredentialSteps.SelectProtocolType
        : VerifyCredentialSteps.SelectNetwork,
  },
  next: {
    name: VerifyCredentialSteps.RequestFieldsVerification,
  },
};

const RequestFieldsVerification = {
  title: i18next.t('Flow.titles.requestFieldsVerification'),
  name: VerifyCredentialSteps.RequestFieldsVerification,
  prev: {
    name: VerifyCredentialSteps.SelectSchema,
  },
  next: {
    title: i18next.t('Flow.buttons.request'),
    name: VerifyCredentialSteps.PresentationRequest,
  },
};

export const PresentationRequestStep = {
  title: i18next.t('Flow.titles.presentationRequest'),
  name: VerifyCredentialSteps.PresentationRequest,
  next: {
    title: i18next.t('Flow.buttons.verifyMore'),
    name: VerifyCredentialSteps.SelectProtocolType,
  },
};

export const steps: Array<StepDetails<VerifyCredentialContext>> = [
  SelectProtocolStep,
  SelectNetworkStep,
  SelectSchemaStep,
  RequestFieldsVerification,
  PresentationRequestStep,
];
