import assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

import * as dotenv from 'dotenv';

const authServiceEndpoint =
  process.env.REACT_APP_AUTH_SERVICE_ENDPOINT || 'http://localhost:3004';
const agencyEndpoint =
  process.env.REACT_APP_AGENCY_ENDPOINT || 'http://localhost:3000';

assert(authServiceEndpoint, 'Auth service endpoint is not specified');
assert(agencyEndpoint, 'Agency endpoint is not specified');

const userCredentials = {
  name: 'demo',
  password: 'Password1234!',
  role: 'Admin',
};

// Define the path to your .env file
const envFilePath = path.resolve(process.cwd(), '.env');

async function main() {
  const envConfig = loadEnvFile(envFilePath);

  // 1. Register demo user
  const registerResponse = await fetch(
    authServiceEndpoint + '/api/v1/user/register',
    {
      method: 'POST',
      body: JSON.stringify(userCredentials),
      headers: getHeaders(),
    },
  );
  await registerResponse.json();

  // 2. Generate tokens
  const loginResponse = await fetch(
    authServiceEndpoint + '/api/v1/oauth/token',
    {
      method: 'POST',
      body: JSON.stringify({
        name: userCredentials.name,
        password: userCredentials.password,
      }),
      headers: getHeaders(),
    },
  );
  const loginResult = await loginResponse.json();

  if (!loginResponse.ok) {
    return;
  }
  const { access, refresh } = loginResult;

  const imagePath = path.join(
    __dirname,
    '..',
    'public/default-schema-avatar.png',
  );

  const params = new FormData();

  const schemaLogoBlob = await fetch(
    'https://cdn.theorg.com/fda49f46-96e2-49b8-99aa-0ff5165953b7_medium.jpg',
  ).then((r) => r.blob());

  const schema = {
    name: 'Passport',
    bgColor: '#171717',
    fields: ['name', 'surname', 'age'],
    registrations: [
      {
        network: 'hedera',
        credentialFormat: 'vc+sd-jwt',
        protocol: 'OpenId4VC',
      },
    ],
  };

  params.append('userLogo', new Blob([fs.readFileSync(imagePath)]), 'user.png');
  params.append('schemaLogo', schemaLogoBlob, 'schema.jpg');
  params.append('schemas', JSON.stringify([schema]));

  // 3. Create DID
  const prepareResponse = await fetch(agencyEndpoint + '/prepare-wallet', {
    method: 'POST',
    body: params,
    headers: {
      Authorization: `Bearer ${access}`,
    },
  });
  const prepareResult = await prepareResponse.json();
  const did = prepareResult.did;

  envConfig['REACT_APP_AUTH_SERVICE_ENDPOINT'] = authServiceEndpoint!;
  envConfig['REACT_APP_AGENCY_ENDPOINT'] = agencyEndpoint!;
  envConfig['REACT_APP_DEMO_USER_DID'] = did;
  envConfig['REACT_APP_DEMO_USER_ACCESS_TOKEN'] = access;
  envConfig['REACT_APP_DEMO_USER_REFRESH_TOKEN'] = refresh;

  writeEnvFile(envFilePath, envConfig);
}

function getHeaders(access?: string): HeadersInit {
  return access
    ? {
        'Content-type': 'application/json; charset=UTF-8',
        Authorization: `Bearer ${access}`,
      }
    : {
        'Content-type': 'application/json; charset=UTF-8',
      };
}

// Function to load and parse the .env file
function loadEnvFile(filePath: string): Record<string, string> {
  const envContent = fs.readFileSync(filePath, { encoding: 'utf8' });
  return dotenv.parse(envContent);
}

// Function to write updated content back to the .env file
function writeEnvFile(
  filePath: string,
  envConfig: Record<string, string>,
): void {
  const envContent = Object.entries(envConfig)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  fs.writeFileSync(filePath, envContent, { encoding: 'utf8' });
}

main();
