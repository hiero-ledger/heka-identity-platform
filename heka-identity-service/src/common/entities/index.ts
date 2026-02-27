import { CredentialStatusList } from './credential-status-list.entity'
import { Identified } from './identified.entity'
import { IssuanceTemplateField } from './issuance-template-field.entity'
import { IssuanceTemplate } from './issuance-template.entity'
import { SchemaField } from './schema-field.entity'
import { SchemaRegistration } from './schema-registration.entity'
import { Schema } from './schema.entity'
import { User } from './user.entity'
import { VerificationTemplateField } from './verification-template-field.entity'
import { VerificationTemplate } from './verification-template.entity'
import { Wallet } from './wallet.entity'

export { MessageDeliveryType } from './user.entity'
export {
  Identified,
  User,
  Wallet,
  Schema,
  SchemaField,
  IssuanceTemplate,
  IssuanceTemplateField,
  VerificationTemplate,
  VerificationTemplateField,
  CredentialStatusList,
}

export default [
  Identified,
  User,
  Wallet,
  Schema,
  SchemaField,
  SchemaRegistration,
  IssuanceTemplate,
  IssuanceTemplateField,
  VerificationTemplate,
  VerificationTemplateField,
  CredentialStatusList,
]
