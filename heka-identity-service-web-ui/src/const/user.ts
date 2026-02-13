export const connectionLabel = 'Agency Demo';

export const mainDidMethod = 'key';

export const userRole = 'Admin';

export const demoUser = {
  did:
    process.env.REACT_APP_DEMO_USER_DID ??
    'did:key:z6MkmSoL4GCTkBtdL7ruiqaqtrijkGpqPPk3DQPY65GndM1j',
  accessToken:
    process.env.REACT_APP_DEMO_USER_ACCESS_TOKEN ??
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlcyI6WyJBZG1pbiJdLCJuYW1lIjoiZGVtbyIsInR5cGUiOiJhY2Nlc3MiLCJpYXQiOjE3Mjc3MDg0NDUsImV4cCI6MzI4MzE3MDg0NDUsImF1ZCI6IkRTUiBHZW5lcmljIEFnZW5jeSIsImlzcyI6IkRTUiIsInN1YiI6IjJmOWM0MTkxLTQ3NzktNGNmMi1iMmFiLTVlNTg1M2YxNDVjNyJ9.vIqIx37zo3oFWjq0g1YZHbfp-hFYesqv5Ax9DPhVwZs',
  refreshToken:
    process.env.REACT_APP_DEMO_USER_REFRESH_TOKEN ??
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE3Mjc3MDg0NDUsImV4cCI6MTgxNDEwODQ0NSwiYXVkIjoiRFNSIEdlbmVyaWMgQWdlbmN5IiwiaXNzIjoiRFNSIiwic3ViIjoiMmY5YzQxOTEtNDc3OS00Y2YyLWIyYWItNWU1ODUzZjE0NWM3IiwianRpIjoiOGE0MGUwYTUtMGRkOS00YjI5LWE0NmMtN2FjZGE1MmZiYmFiIn0.5jaq44p4EQpu0P3wEX-wiB3SfbWrrJQqBamkPX-1UeM',
};

export const baseDisplayMetadata = {
  background_color: '#171717',
  logo: {
    url: 'https://cdn.theorg.com/fda49f46-96e2-49b8-99aa-0ff5165953b7_medium.jpg',
  },
};
