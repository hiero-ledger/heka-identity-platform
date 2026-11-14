import { screen } from '@testing-library/react';

import { useGetCredentialConfigQuery } from '@/entities/Credential/api/credentialApi';
import {
  useGetIssuanceTemplateListQuery,
  useGetIssuanceTemplateQuery,
} from '@/entities/IssuanceTemplate/api/issuanceTemplateApi';
import {
  useGetDemoSchemaListQuery,
  useGetSchemaListQuery,
} from '@/entities/Schema/api/schemaApi';
import {
  useGetOwnDidsQuery,
  useGetProfileQuery,
} from '@/entities/User/api/userApi';
import {
  useGetVerificationTemplateListQuery,
  useGetVerificationTemplateQuery,
} from '@/entities/VerificationTemplate/api/verificationTemplateApi';
import { dropSessionWhileMounted } from '@/shared/lib/tests/apiCache';
import {
  createMockApi,
  MockApi,
  renderWithProviders,
} from '@/shared/lib/tests/renderWithProviders';

jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: { error: jest.fn() },
}));

/** Every query of the signed-in tenant, mounted at once */
const TenantReads = ({ skip = false }: { skip?: boolean }) => {
  const queries = [
    useGetSchemaListQuery({ isHidden: false }, { skip }),
    useGetProfileQuery(undefined, { skip }),
    useGetOwnDidsQuery({ method: 'key' }, { skip }),
    useGetCredentialConfigQuery(undefined, { skip }),
    useGetIssuanceTemplateListQuery(undefined, { skip }),
    useGetIssuanceTemplateQuery('t1', { skip }),
    useGetVerificationTemplateListQuery(undefined, { skip }),
    useGetVerificationTemplateQuery('t2', { skip }),
  ];
  const loaded = queries.filter((query) => query.isSuccess).length;
  return <p>{`loaded ${loaded}`}</p>;
};

const DemoReads = () => {
  const { isSuccess } = useGetDemoSchemaListQuery();
  return <p>{isSuccess ? 'demo loaded' : 'demo loading'}</p>;
};

const answeringApi = () => {
  const api = createMockApi();
  api.get.mockResolvedValue({ data: { items: [] } });
  return api;
};

const signedOut = {
  user: {
    isLoading: false,
    isPreparing: false,
    isWalletPrepared: false,
    data: { name: null, tokens: { accessToken: null } },
  },
};

const requests = (api: MockApi) => api.get.mock.calls.length;

describe('signedInOnly tenant queries', () => {
  test('load while signed in', async () => {
    const api = answeringApi();

    renderWithProviders(<TenantReads />, { api });

    expect(await screen.findByText('loaded 8')).toBeInTheDocument();
    expect(requests(api)).toBe(8);
  });

  test('send nothing while signed out', async () => {
    const api = answeringApi();

    renderWithProviders(<TenantReads />, { api, initialState: signedOut });
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(requests(api)).toBe(0);
    expect(screen.getByText('loaded 0')).toBeInTheDocument();
  });

  test('send nothing when the session drops while they are mounted', async () => {
    const api = answeringApi();
    const { store } = renderWithProviders(<TenantReads />, { api });
    await screen.findByText('loaded 8');

    await dropSessionWhileMounted(store);

    expect(requests(api)).toBe(8);
    // Nothing (not even an error entry) is left in the cache
    expect(store.getState().agencyApi.queries).toEqual({});
  });

  test('keep the caller’s own skip', async () => {
    const api = answeringApi();

    renderWithProviders(<TenantReads skip />, { api });
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(requests(api)).toBe(0);
  });

  test('the demo list is still read for a visitor, with the demo client', async () => {
    const api = answeringApi();
    const demoApi = answeringApi();

    renderWithProviders(<DemoReads />, {
      api,
      demoApi,
      initialState: signedOut,
    });

    expect(await screen.findByText('demo loaded')).toBeInTheDocument();
    expect(requests(demoApi)).toBe(1);
    expect(requests(api)).toBe(0);
  });
});
