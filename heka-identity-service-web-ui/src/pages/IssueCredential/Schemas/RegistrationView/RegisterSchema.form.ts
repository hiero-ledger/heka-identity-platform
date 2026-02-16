import { DidMethods } from '@/components/Steps/SelectNetwork/SelectNetwork.const';
import { ProtocolType } from '@/entities/Schema';
import { CredentialRegistrationFormat } from '@/entities/Schema/model/types/schema';

export interface RegisterSchemaFormData {
  protocol?: ProtocolType;
  credentialFormat?: CredentialRegistrationFormat;
  network?: DidMethods;
  did?: string;
}

export const RegisterSchemaFormDefaultValues = {
  protocol: undefined,
  credentialFormat: undefined,
  network: undefined,
  did: undefined,
} as RegisterSchemaFormData;
