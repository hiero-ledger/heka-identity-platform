export const connectionLabel = 'Agency Demo';

export const mainDidMethod = 'key';

export const userRole = 'Admin';

export const demoUser = {
  did: process.env.REACT_APP_DEMO_USER_DID ?? '',
  accessToken: process.env.REACT_APP_DEMO_USER_ACCESS_TOKEN ?? '',
  refreshToken: process.env.REACT_APP_DEMO_USER_REFRESH_TOKEN ?? '',
};

export const baseDisplayMetadata = {
  background_color: '#171717',
  logo: {
    url: 'https://cdn.theorg.com/fda49f46-96e2-49b8-99aa-0ff5165953b7_medium.jpg',
  },
};
