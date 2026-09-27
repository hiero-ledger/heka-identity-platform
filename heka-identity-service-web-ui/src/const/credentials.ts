import { baseDisplayMetadata } from '@/const/user';

export const credentialsContext = 'https://www.w3.org/2018/credentials/v1';

export const VcSdJwtPassportCredential = {
  name: 'Passport',
  claims: ['given_name', 'family_name', 'birth_date', 'passport_number', 'expiry_date'],
  display: {
    backgroundColor: baseDisplayMetadata.background_color,
    logoUrl: baseDisplayMetadata.logo.url,
  },
};
