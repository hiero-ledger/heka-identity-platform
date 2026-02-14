import axios from 'axios';

import { demoUser } from '@/const/user';

export const $agencyDemoApi = axios.create({
  baseURL: `${process.env.REACT_APP_AGENCY_ENDPOINT}`,
  headers: {
    Authorization: `Bearer ${demoUser.accessToken}`,
  },
});
