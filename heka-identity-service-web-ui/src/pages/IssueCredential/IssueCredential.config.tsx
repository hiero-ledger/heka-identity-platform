import { WizardContext } from '@/app/types/WizardContext';
import { StepDetails } from '@/components/Steps/Step.types';
import { Schema, ProtocolType } from '@/entities/Schema';
import {
  CredentialFormat,
  credentialFormatToCredentialRegistrationFormat,
} from '@/entities/Schema/model/types/schema';
import { getRegistration } from '@/entities/Schema/model/utils/schema';
import i18next from '@/translations';

export interface IssueCredentialContext extends WizardContext {
  protocolType?: ProtocolType;
  credentialType?: CredentialFormat;
  network?: string;
  did?: string;
  schema?: Schema;
  credDefId?: string;
  credDefTag?: string;
  connectionId?: string;
  credentialValues?: Record<string, string>;
  templateId?: string;
  templateName?: string;
}

export enum IssueCredentialSteps {
  SelectProtocolType = 'SelectProtocolType',
  SelectNetwork = 'SelectNetwork',
  SelectSchema = 'SelectSchema',
  SchemaRegistration = 'SchemaRegistration',
  IssueNewCredential = 'IssueNewCredential',
  CredentialOffer = 'CredentialOffer',
}

export const totalPreparationSteps = 5;

const SelectProtocolStep = {
  title: i18next.t('Flow.titles.selectProtocol'),
  name: IssueCredentialSteps.SelectProtocolType,
  next: {
    name: IssueCredentialSteps.SelectNetwork,
  },
};

const SelectNetworkStep = {
  title: i18next.t('Flow.titles.selectNetwork'),
  name: IssueCredentialSteps.SelectNetwork,
  prev: {
    name: IssueCredentialSteps.SelectProtocolType,
  },
  next: {
    name: IssueCredentialSteps.SelectSchema,
  },
};

const SelectSchemaStep = {
  title: i18next.t('Flow.titles.selectSchema'),
  name: IssueCredentialSteps.SelectSchema,
  prev: {
    name: IssueCredentialSteps.SelectNetwork,
  },
  next: {
    name: (context?: IssueCredentialContext) => {
      return getRegistration(context!.schema!, {
        ...context!,
        credentialFormat: credentialFormatToCredentialRegistrationFormat(
          context!.credentialType!,
        ),
      })
        ? IssueCredentialSteps.IssueNewCredential
        : IssueCredentialSteps.SchemaRegistration;
    },
  },
};

const SchemaRegistration = {
  title: i18next.t('Flow.titles.schemaRegistration'),
  name: IssueCredentialSteps.SchemaRegistration,
  prev: {
    name: IssueCredentialSteps.SelectSchema,
  },
  next: {
    name: IssueCredentialSteps.IssueNewCredential,
  },
};

const FillCredentialStep = {
  title: i18next.t('Flow.titles.fillCredential'),
  name: IssueCredentialSteps.IssueNewCredential,
  prev: {
    name: IssueCredentialSteps.SelectSchema,
  },
  next: {
    name: IssueCredentialSteps.CredentialOffer,
  },
};

export const CredentialOfferStep = {
  title: i18next.t('Flow.titles.credentialOffer'),
  name: IssueCredentialSteps.CredentialOffer,
  next: {
    title: i18next.t('Flow.buttons.issueMore'),
    name: IssueCredentialSteps.SelectProtocolType,
  },
};

export const steps: Array<StepDetails<IssueCredentialContext>> = [
  SelectProtocolStep,
  SelectNetworkStep,
  SelectSchemaStep,
  SchemaRegistration,
  // SelectCredDefStep,
  FillCredentialStep,
  CredentialOfferStep,
];
