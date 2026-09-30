/**
 * Prepares the demo account's wallet in the identity service and records its DID in `.env`
 * (`REACT_APP_DEMO_USER_DID`), which the public demo pages use as their verifier / issuer id.
 *
 * Provider-neutral: the demo account itself is created by the OIDC provider recipe (the `heka-demo`
 * service-account client in the Keycloak realm or the Auth0 tenant script), and its token comes from
 * the identity service's demo-token broker (`GET /demo/token`, enabled there with `DEMO_*`). The web
 * UI fetches that token at runtime too, so the DID is the only thing baked into the bundle.
 *
 * Environment:
 *   REACT_APP_AGENCY_ENDPOINT  identity service base URL (default http://localhost:3000)
 *   DEMO_ACCESS_TOKEN          optional: a token to use instead of the broker (e.g. a user token),
 *                              in which case the DID lands in that token's tenant
 *
 * Run: yarn prepare-demo-user
 */
import assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

import * as dotenv from 'dotenv';

const agencyEndpoint = (
  process.env.REACT_APP_AGENCY_ENDPOINT || 'http://localhost:3000'
).replace(/\/+$/, '');
const tokenOverride = process.env.DEMO_ACCESS_TOKEN?.trim();

assert(agencyEndpoint, 'Identity service endpoint is not specified');

const envFilePath = path.resolve(process.cwd(), '.env');

/** Settings of the retired build-time token; dropped from `.env` when still present. */
const obsoleteEnvKeys = [
  'REACT_APP_AUTH_SERVICE_ENDPOINT',
  'REACT_APP_DEMO_USER_ACCESS_TOKEN',
  'REACT_APP_DEMO_USER_REFRESH_TOKEN',
];

const schemaLogoUrl =
  'https://cdn.theorg.com/fda49f46-96e2-49b8-99aa-0ff5165953b7_medium.jpg';

const schemas = [
  {
    name: 'Passport',
    bgColor: '#171717',
    fields: [
      'given_name',
      'family_name',
      'birth_date',
      'passport_number',
      'expiry_date',
    ],
    registrations: [
      {
        network: 'key',
        credentialFormat: 'vc+sd-jwt',
        protocol: 'OpenId4VC',
      },
    ],
  },
  {
    name: 'mDL',
    bgColor: '#1a3a5c',
    fields: [
      'given_name',
      'family_name',
      'birth_date',
      'age_over_18',
      'document_number',
      'expiry_date',
    ],
    registrations: [
      {
        network: 'key',
        credentialFormat: 'mso_mdoc',
        protocol: 'OpenId4VC',
      },
    ],
  },
];

async function main() {
  const envConfig = loadEnvFile(envFilePath);

  // 1. Demo account token: the broker's short-lived token, unless one is supplied.
  const accessToken = tokenOverride ?? (await fetchDemoToken());

  // 2. Prepare the wallet: user logo, demo schemas with their logo, and the demo DID.
  const userLogo = fs.readFileSync(
    path.join(__dirname, '..', 'public/default-schema-avatar.png'),
  );
  const schemaLogo = await fetchSchemaLogo(userLogo);

  const params = new FormData();
  params.append('userLogo', new Blob([new Uint8Array(userLogo)]), 'user.png');
  params.append('schemaLogo', schemaLogo, 'schema.jpg');
  params.append('schemas', JSON.stringify(schemas));

  const prepareResponse = await fetch(`${agencyEndpoint}/prepare-wallet`, {
    method: 'POST',
    body: params,
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const prepareResult = (await prepareResponse.json()) as {
    did?: string;
    message?: string | string[];
  };
  if (!prepareResponse.ok || !prepareResult.did) {
    throw new Error(
      `prepare-wallet failed: ${prepareResponse.status} ${describeMessage(prepareResult.message)}`,
    );
  }
  const { did } = prepareResult;

  // 3. Record the DID for the build.
  envConfig['REACT_APP_AGENCY_ENDPOINT'] = agencyEndpoint;
  envConfig['REACT_APP_DEMO_USER_DID'] = did;
  for (const key of obsoleteEnvKeys) {
    delete envConfig[key];
  }
  writeEnvFile(envFilePath, envConfig);

  console.log(`Demo user DID: ${did}`);
  console.log(`Written to ${envFilePath} as REACT_APP_DEMO_USER_DID`);
}

async function fetchDemoToken(): Promise<string> {
  const url = `${agencyEndpoint}/demo/token`;
  const response = await fetch(url);
  const result = (await response.json().catch(() => ({}))) as {
    access_token?: string;
    message?: string | string[];
  };
  if (!response.ok || !result.access_token) {
    throw new Error(
      `demo token broker at ${url} answered ${response.status} ${describeMessage(result.message)}. ` +
        'Enable it in the identity service (DEMO_TOKEN_URL, DEMO_CLIENT_ID, DEMO_CLIENT_SECRET) ' +
        'or pass a token in DEMO_ACCESS_TOKEN.',
    );
  }
  return result.access_token;
}

/** The demo schema logo from the CDN, or the local avatar when the CDN is unreachable. */
async function fetchSchemaLogo(fallback: Buffer): Promise<Blob> {
  try {
    const response = await fetch(schemaLogoUrl);
    if (response.ok) return await response.blob();
    console.warn(
      `schema logo download failed (${response.status}), using the local avatar`,
    );
  } catch (error) {
    console.warn(
      `schema logo download failed (${String(error)}), using the local avatar`,
    );
  }
  return new Blob([new Uint8Array(fallback)], { type: 'image/png' });
}

function describeMessage(message: string | string[] | undefined): string {
  return Array.isArray(message) ? message.join(', ') : (message ?? '');
}

// Loads and parses the .env file; a missing file is an empty configuration.
function loadEnvFile(filePath: string): Record<string, string> {
  if (!fs.existsSync(filePath)) return {};
  return dotenv.parse(fs.readFileSync(filePath, { encoding: 'utf8' }));
}

// Writes the configuration back to the .env file.
function writeEnvFile(
  filePath: string,
  envConfig: Record<string, string>,
): void {
  const envContent = Object.entries(envConfig)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  fs.writeFileSync(filePath, `${envContent}\n`, { encoding: 'utf8' });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
