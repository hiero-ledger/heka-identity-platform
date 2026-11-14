import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';

import { ProtocolType } from '@/entities/Schema';
import { DidDocument } from '@/entities/User/model/types/user';
import { INDY_DID, routeAgencyGets } from '@/pages/IssueCredential/testUtils';
import { dropSessionWhileMounted } from '@/shared/lib/tests/apiCache';
import {
  createMockApi,
  renderWithProviders,
} from '@/shared/lib/tests/renderWithProviders';

import { SelectNetwork } from './SelectNetwork';

let mockIsMobile = false;
jest.mock('@/components/Screen/Screen', () => ({
  ...jest.requireActual('@/components/Screen/Screen'),
  useMobile: () => mockIsMobile,
}));

const Harness = ({
  withDid = true,
  didOptional,
  initialNetwork,
  initialDid,
}: {
  withDid?: boolean;
  didOptional?: boolean;
  initialNetwork?: string;
  initialDid?: string;
}) => {
  const [network, setNetwork] = useState<string | undefined>(initialNetwork);
  const [did, setDid] = useState<string | undefined>(initialDid);
  return (
    <>
      <SelectNetwork
        title="Select network"
        protocolType={ProtocolType.Aries}
        network={network}
        did={did}
        onChangeNetwork={setNetwork}
        onChangeDid={withDid ? setDid : undefined}
        didOptional={didOptional}
        onPrev={jest.fn()}
        onNext={jest.fn()}
      />
      <output data-testid="selection">{`${network}|${did}`}</output>
    </>
  );
};

const renderStep = (
  props: React.ComponentProps<typeof Harness> = {},
  dids?: DidDocument[],
) => {
  const api = createMockApi();
  routeAgencyGets(api, { dids });
  const { store } = renderWithProviders(<Harness {...props} />, { api });
  return { api, store, user: userEvent.setup() };
};

const didRequests = (api: ReturnType<typeof createMockApi>, method?: string) =>
  api.get.mock.calls.filter(
    ([url, config]) => url === '/dids' && config?.params?.method === method,
  ).length;

describe('SelectNetwork', () => {
  afterEach(() => {
    mockIsMobile = false;
  });

  test('picks the first network and its first DID', async () => {
    const { api } = renderStep();

    await waitFor(() =>
      expect(screen.getByTestId('selection')).toHaveTextContent(
        `indy|${INDY_DID}`,
      ),
    );
    expect(api.get).toHaveBeenCalledWith('/dids', {
      params: { own: true, method: 'indy' },
    });
    expect(screen.getByRole('button', { name: /Next/ })).toBeEnabled();
  });

  test('can continue without a DID when it is optional', async () => {
    renderStep({ withDid: false, didOptional: true });

    await waitFor(() =>
      expect(screen.getByTestId('selection')).toHaveTextContent(
        'indy|undefined',
      ),
    );
    expect(screen.queryByText('Select DID')).toBeNull();
    expect(screen.getByRole('button', { name: /Next/ })).toBeEnabled();
  });

  test('switches the network from a dropdown on mobile', async () => {
    mockIsMobile = true;
    const { api, user } = renderStep();
    await waitFor(() =>
      expect(screen.getByTestId('selection')).toHaveTextContent(
        `indy|${INDY_DID}`,
      ),
    );

    await user.click(screen.getByRole('button', { name: /^indy/ }));
    await user.click(await screen.findByRole('option', { name: 'hedera' }));

    // hedera has no DIDs: the indy DID must not stay selected
    await waitFor(() =>
      expect(screen.getByTestId('selection')).toHaveTextContent(
        'hedera|undefined',
      ),
    );
    expect(api.get).toHaveBeenCalledWith('/dids', {
      params: { own: true, method: 'hedera' },
    });
    expect(screen.getByRole('button', { name: /Next/ })).toBeDisabled();
  });

  test('clears the DID after switching to a network without DIDs', async () => {
    const { user } = renderStep();
    await waitFor(() =>
      expect(screen.getByTestId('selection')).toHaveTextContent(
        `indy|${INDY_DID}`,
      ),
    );

    await user.click(screen.getByText('hedera'));

    await waitFor(() =>
      expect(screen.getByTestId('selection')).toHaveTextContent(
        'hedera|undefined',
      ),
    );
    expect(screen.queryByText(INDY_DID)).toBeNull();
    expect(screen.getByRole('button', { name: /Next/ })).toBeDisabled();
  });

  test('reads the networks from the cached credential config', async () => {
    const { api } = renderStep();

    expect(await screen.findByText('hedera')).toBeInTheDocument();
    expect(
      api.get.mock.calls.filter(([url]) => url === '/credentials/config'),
    ).toHaveLength(1);
  });

  test('caches the DIDs per network: switching back sends no new request', async () => {
    const HEDERA_DID = 'did:hedera:test:issuer1';
    const { api, user } = renderStep({}, [
      { id: INDY_DID, verificationMethod: [] },
      { id: HEDERA_DID, verificationMethod: [] },
    ] as DidDocument[]);
    await screen.findByText(INDY_DID);

    // The hedera DIDs are still loading: the indy DIDs must not be offered for hedera
    let answerHedera: (value: unknown) => void = () => {};
    const routed = api.get.getMockImplementation()!;
    api.get.mockImplementation((url: string, config) =>
      url === '/dids' && config?.params?.method === 'hedera'
        ? new Promise((resolve) => {
            answerHedera = resolve;
          })
        : routed(url, config),
    );
    await user.click(screen.getByText('hedera'));
    await waitFor(() =>
      expect(screen.getByTestId('selection')).toHaveTextContent(
        'hedera|undefined',
      ),
    );
    expect(screen.queryByText(INDY_DID)).toBeNull();

    answerHedera({ data: [{ id: HEDERA_DID, verificationMethod: [] }] });
    expect(await screen.findByText(HEDERA_DID)).toBeInTheDocument();

    await user.click(screen.getByText('indy'));
    expect(await screen.findByText(INDY_DID)).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByTestId('selection')).toHaveTextContent(
        `indy|${INDY_DID}`,
      ),
    );

    expect(didRequests(api, 'indy')).toBe(1);
    expect(didRequests(api, 'hedera')).toBe(1);
  });

  test('keeps a previously chosen DID when the step is shown again', async () => {
    const second = 'did:indy:test:issuer2';
    const { api } = renderStep({ initialNetwork: 'indy', initialDid: second }, [
      { id: INDY_DID, verificationMethod: [] },
      { id: second, verificationMethod: [] },
    ] as DidDocument[]);

    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith('/dids', {
        params: { own: true, method: 'indy' },
      }),
    );
    expect(await screen.findByText(second)).toBeInTheDocument();
    expect(screen.getByTestId('selection')).toHaveTextContent(`indy|${second}`);
  });

  test('sends nothing when the session drops while the step is open', async () => {
    const { api, store } = renderStep();
    await screen.findByText(INDY_DID);
    const before = api.get.mock.calls.length;

    await dropSessionWhileMounted(store);

    expect(api.get).toHaveBeenCalledTimes(before);
  });
});
