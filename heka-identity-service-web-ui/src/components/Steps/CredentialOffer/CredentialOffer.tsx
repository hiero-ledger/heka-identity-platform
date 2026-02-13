import { AnoncredsCredentialOffer } from '@/components/Steps/CredentialOffer/protocols/AnoncredsCredentialOffer';
import { OpenIdCredentialOffer } from '@/components/Steps/CredentialOffer/protocols/OpenIdCredentialOffer';
import { NextStepName, StepDetails } from '@/components/Steps/Step.types';
import {
  CredentialFormat,
  ProtocolType,
  Schema,
} from '@/entities/Schema/model/types/schema';

export interface CredentialOfferContext {
  protocolType?: ProtocolType;
  credentialType?: CredentialFormat;
  did?: string;
  network?: string;
  schema?: Schema;
  credentialValues?: Record<string, string>;
  useDemo?: boolean;
}

export interface CredentialOfferProps<T> {
  stepDetails: StepDetails<T>;
  context: CredentialOfferContext;
  onChangeStep: (step?: NextStepName<T>) => void;
}

export const CredentialOffer = <T extends object>(
  props: CredentialOfferProps<T>,
) => {
  return props.context.protocolType === ProtocolType.Oid4vc ? (
    <OpenIdCredentialOffer {...props} />
  ) : (
    <AnoncredsCredentialOffer {...props} />
  );
};
