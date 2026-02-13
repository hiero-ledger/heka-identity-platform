import React from 'react';

import { NextStepName, StepDetails } from '@/components/Steps/Step.types';
import { AnoncredsVerificationRequest } from '@/components/Steps/VerificationRequest/protocols/AnoncredsVerificationRequest';
import { OpenIdVerificationRequest } from '@/components/Steps/VerificationRequest/protocols/OpenIdVerificationRequest';
import {
  CredentialFormat,
  ProtocolType,
  Schema,
} from '@/entities/Schema/model/types/schema';

export interface PresentationRequestContext {
  protocolType?: ProtocolType;
  credentialType?: CredentialFormat;
  did?: string;
  schema?: Schema;
  attributes?: Array<string>;
  useDemo?: boolean;
}

export interface VerificationRequestProps<T> {
  context: PresentationRequestContext;
  stepDetails: StepDetails<T>;
  onChangeStep: (step?: NextStepName<T>) => void;
}

export const VerificationRequest = <T extends object>(
  props: VerificationRequestProps<T>,
) => {
  return props.context.protocolType === ProtocolType.Oid4vc ? (
    <OpenIdVerificationRequest {...props} />
  ) : (
    <AnoncredsVerificationRequest {...props} />
  );
};
