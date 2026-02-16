import { DidMethods } from '@/components/Steps/SelectNetwork/SelectNetwork.const';
import { ProtocolType } from '@/entities/Schema';
import {
  AriesCredentialRegistrationFormat,
  Openid4CredentialRegistrationFormat,
} from '@/entities/Schema/model/types/schema';
import { RegisterSchemaFormData } from '@/pages/IssueCredential/Schemas/RegistrationView/RegisterSchema.form';

export const RegistrationTargets = [
  {
    protocol: ProtocolType.Aries,
    credentialFormat: AriesCredentialRegistrationFormat.Anoncreds,
    network: DidMethods.Indy,
  },
  {
    protocol: ProtocolType.Aries,
    credentialFormat: AriesCredentialRegistrationFormat.Anoncreds,
    network: DidMethods.Hedera,
  },
  {
    protocol: ProtocolType.Oid4vc,
    credentialFormat: Openid4CredentialRegistrationFormat.SdJwt,
    network: DidMethods.Key,
  },
  {
    protocol: ProtocolType.Oid4vc,
    credentialFormat: Openid4CredentialRegistrationFormat.JwtJson,
    network: DidMethods.Key,
  },
  {
    protocol: ProtocolType.Oid4vc,
    credentialFormat: Openid4CredentialRegistrationFormat.JwtJsonLd,
    network: DidMethods.Key,
  },
] as RegisterSchemaFormData[];
