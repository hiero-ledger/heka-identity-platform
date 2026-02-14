import { baseDisplayMetadata } from '@/const/user';

export const credentialsContext = 'https://www.w3.org/2018/credentials/v1';

export const VcSdJwtPassportCredential = {
  name: 'Passport',
  claims: ['name', 'surname', 'age'],
  display: {
    backgroundColor: baseDisplayMetadata.background_color,
    logoUrl: baseDisplayMetadata.logo.url,
  },
};
