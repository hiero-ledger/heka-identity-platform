import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import toast from 'react-hot-toast';

import {
  OpenIdPresentationState,
  PresentationSchema,
} from '@/entities/Presentation/model/types/presentation';
import {
  Openid4CredentialFormat,
  ProtocolType,
} from '@/entities/Schema/model/types/schema';
import { USER_ID } from '@/entities/User/model/const';
import { makeSchema } from '@/pages/VerifyCredential/testUtils';
import { PresentationRequestStep } from '@/pages/VerifyCredential/VerifyCredential.config';
import { isDcApiSupported } from '@/shared/lib/dcApi';
import {
  createMockApi,
  MockApi,
  renderWithProviders,
} from '@/shared/lib/tests/renderWithProviders';

import { PresentationRequestContext } from './VerificationRequest';
import { VerificationRequest } from './VerificationRequest';

jest.mock('@/components/QRCode', () => ({
  QRCode: jest.requireActual('./testUtils').QRCodeStub,
}));
jest.mock('@/shared/lib/dcApi', () => ({
  ...jest.requireActual('@/shared/lib/dcApi'),
  isDcApiSupported: jest.fn(() => false),
}));

const mockIsDcApiSupported = isDcApiSupported as jest.Mock;

const schema = makeSchema();

const context: PresentationRequestContext = {
  protocolType: ProtocolType.Oid4vc,
  credentialType: Openid4CredentialFormat.SdJwt,
  schema,
  attributes: ['firstName'],
};

// The thunk checks `constructor.name`, so the class must be called DigitalCredential
class DigitalCredential {
  constructor(public data: unknown) {}
}

const domError = (name: string) => {
  const error = new Error(name);
  error.name = name;
  return error;
};

const mockCredentialsGet = (impl: (options: unknown) => Promise<unknown>) => {
  const get = jest.fn(impl);
  Object.defineProperty(global.navigator, 'credentials', {
    value: { get },
    configurable: true,
    writable: true,
  });
  return get;
};

const stubVerifier = (api: MockApi) => {
  api.post.mockImplementation((url: string) => {
    if (url === '/openid4vc/verification-session/request') {
      return Promise.resolve({
        data: {
          authorizationRequest: 'openid4vp://request',
          authorizationRequestObject: { nonce: 'n-1' },
          verificationSession: {
            id: 'vs-1',
            state: OpenIdPresentationState.RequestCreated,
          },
        },
      });
    }
    if (url === '/openid4vc/verification-session/vs-1/verify') {
      return Promise.resolve({
        data: { sharedAttributes: { firstName: 'Alice', adult: true } },
      });
    }
    return Promise.resolve({ data: undefined });
  });
};

const renderRequest = (
  ctx: PresentationRequestContext = context,
  options: {
    api?: MockApi;
    initialState?: { presentations: PresentationSchema };
  } = {},
) => {
  const onChangeStep = jest.fn();
  const view = renderWithProviders(
    <VerificationRequest
      context={ctx}
      stepDetails={PresentationRequestStep}
      onChangeStep={onChangeStep}
    />,
    options,
  );
  return { ...view, onChangeStep };
};

describe('OpenIdVerificationRequest', () => {
  beforeEach(() => {
    localStorage.setItem(USER_ID, 'did:key:verifier');
    mockIsDcApiSupported.mockReturnValue(false);
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('QR code', () => {
    test('requests a presentation and shows the authorization request as a QR code', async () => {
      const api = createMockApi();
      stubVerifier(api);
      renderRequest(context, { api });

      expect(await screen.findByTestId('qr')).toHaveTextContent(
        'openid4vp://request',
      );
      expect(api.post).toHaveBeenCalledWith(
        '/openid4vc/verification-session/request',
        expect.anything(),
      );
      expect(
        screen.queryByText('How would you like to present?'),
      ).not.toBeInTheDocument();
    });

    test('reports an incomplete context instead of requesting', async () => {
      const error = jest.spyOn(toast, 'error');
      const { api } = renderRequest({ ...context, schema: undefined });

      await waitFor(() =>
        expect(error).toHaveBeenCalledWith(
          'Credential verification context is invalid',
        ),
      );
      expect(api.post).not.toHaveBeenCalled();
    });

    test('polls the session until the response is verified', async () => {
      const api = createMockApi();
      stubVerifier(api);
      api.get.mockResolvedValue({
        data: {
          id: 'vs-1',
          state: OpenIdPresentationState.ResponseVerified,
          sharedAttributes: { firstName: 'Alice' },
        },
      });
      renderRequest(context, { api });

      expect(
        await screen.findByText('Credential verified', {}, { timeout: 4000 }),
      ).toBeInTheDocument();
      expect(api.get).toHaveBeenCalledWith(
        '/openid4vc/verification-session/vs-1',
      );
      expect(screen.getByText('Alice')).toBeInTheDocument();
    });
  });

  describe('Digital Credentials API', () => {
    beforeEach(() => {
      mockIsDcApiSupported.mockReturnValue(true);
    });

    test('lets the user fall back to the QR code', async () => {
      const user = userEvent.setup();
      const api = createMockApi();
      stubVerifier(api);
      renderRequest(context, { api });

      expect(
        screen.getByText('How would you like to present?'),
      ).toBeInTheDocument();
      expect(api.post).not.toHaveBeenCalled();

      await user.click(screen.getByRole('button', { name: 'Legacy QR code' }));

      expect(await screen.findByTestId('qr')).toBeInTheDocument();
    });

    test('presents through the browser wallet and shows the verified attributes', async () => {
      const user = userEvent.setup();
      const api = createMockApi();
      stubVerifier(api);
      const get = mockCredentialsGet(() =>
        Promise.resolve(new DigitalCredential({ vp_token: 'token' })),
      );
      renderRequest(context, { api });

      await user.click(
        screen.getByRole('button', { name: 'Digital Credentials API' }),
      );
      expect(
        screen.getByText('Present with a digital wallet'),
      ).toBeInTheDocument();
      await user.click(
        screen.getByRole('button', { name: 'Present credential' }),
      );

      expect(
        await screen.findByText('Credential verified'),
      ).toBeInTheDocument();
      expect(get).toHaveBeenCalled();
      expect(api.post).toHaveBeenCalledWith(
        '/openid4vc/verification-session/vs-1/verify',
        expect.objectContaining({
          authorizationResponse: { vp_token: 'token' },
        }),
      );
      expect(screen.getByText('Alice')).toBeInTheDocument();
      expect(screen.getByText('Yes')).toBeInTheDocument();
    });

    test.each([
      ['NotAllowedError', 'Presentation cancelled. No credential was shared.'],
      [
        'NotSupportedError',
        'This browser cannot present credentials with the Digital Credentials API. Try the QR code option instead.',
      ],
      [
        'TypeError',
        'Could not get a credential via the Digital Credentials API. Make sure a compatible wallet is installed, then try again.',
      ],
    ])('explains a %s from the wallet picker', async (name, message) => {
      const user = userEvent.setup();
      const api = createMockApi();
      stubVerifier(api);
      mockCredentialsGet(() => Promise.reject(domError(name)));
      renderRequest(context, { api });

      await user.click(
        screen.getByRole('button', { name: 'Digital Credentials API' }),
      );
      await user.click(
        screen.getByRole('button', { name: 'Present credential' }),
      );

      expect(await screen.findByText(message)).toBeInTheDocument();
    });

    test('cancels a pending wallet request', async () => {
      const user = userEvent.setup();
      const api = createMockApi();
      stubVerifier(api);
      mockCredentialsGet(
        (options) =>
          new Promise((_, reject) => {
            const { signal } = options as { signal: AbortSignal };
            signal.addEventListener('abort', () =>
              reject(domError('AbortError')),
            );
          }),
      );
      renderRequest(context, { api });

      await user.click(
        screen.getByRole('button', { name: 'Digital Credentials API' }),
      );
      await user.click(
        screen.getByRole('button', { name: 'Present credential' }),
      );
      await user.click(await screen.findByRole('button', { name: 'Cancel' }));

      expect(
        await screen.findByText(
          'Presentation cancelled. No credential was shared.',
        ),
      ).toBeInTheDocument();
    });

    test('leaving the step aborts a pending wallet request', async () => {
      const user = userEvent.setup();
      const api = createMockApi();
      stubVerifier(api);
      let pickerSignal: AbortSignal | undefined;
      mockCredentialsGet((options) => {
        pickerSignal = (options as { signal: AbortSignal }).signal;
        return new Promise(() => {});
      });
      const { unmount } = renderRequest(context, { api });

      await user.click(
        screen.getByRole('button', { name: 'Digital Credentials API' }),
      );
      await user.click(
        screen.getByRole('button', { name: 'Present credential' }),
      );
      await waitFor(() => expect(pickerSignal).toBeDefined());

      unmount();

      expect(pickerSignal?.aborted).toBe(true);
      expect(api.post).not.toHaveBeenCalledWith(
        '/openid4vc/verification-session/vs-1/verify',
        expect.anything(),
      );
    });

    test('rejects an incomplete context and can go back to the method choice', async () => {
      const user = userEvent.setup();
      const { api } = renderRequest({ ...context, credentialType: undefined });

      await user.click(
        screen.getByRole('button', { name: 'Digital Credentials API' }),
      );
      await user.click(
        screen.getByRole('button', { name: 'Present credential' }),
      );

      expect(
        screen.getByText('Credential verification context is invalid'),
      ).toBeInTheDocument();
      expect(api.post).not.toHaveBeenCalled();

      await user.click(screen.getByRole('button', { name: 'Back' }));
      expect(
        screen.getByText('How would you like to present?'),
      ).toBeInTheDocument();
    });
  });

  describe('presentation received', () => {
    const completedState = (
      sharedAttributes: Array<{ name: string; value: string }>,
    ) => ({
      presentations: {
        isLoading: false,
        presentationSession: {
          id: 'vs-1',
          state: OpenIdPresentationState.ResponseVerified,
          sharedAttributes,
        },
      },
    });

    test('lists the shared attributes in schema order with readable booleans', () => {
      renderRequest(context, {
        initialState: completedState([
          { name: 'age', value: 'false' },
          { name: 'lastName', value: 'Smith' },
          { name: 'firstName', value: 'true' },
        ]),
      });

      const rows = screen
        .getAllByText(/^(firstName|lastName|age)$/)
        .map((el) => [el.textContent, el.nextSibling?.textContent]);
      expect(rows).toEqual([
        ['firstName', 'Yes'],
        ['lastName', 'Smith'],
        ['age', 'No'],
      ]);
    });

    test('moves on and offers to save the request as a template', async () => {
      const user = userEvent.setup();
      const { onChangeStep } = renderRequest(context, {
        initialState: completedState([]),
      });

      await user.click(
        screen.getByRole('button', { name: 'Verify more credential' }),
      );
      expect(onChangeStep).toHaveBeenCalledWith('SelectProtocolType');

      await user.click(
        screen.getByRole('button', { name: 'Save as template' }),
      );
      expect(await screen.findByRole('dialog')).toBeInTheDocument();
    });

    test('hides template saving in the demo', () => {
      renderRequest(
        { ...context, useDemo: true },
        { initialState: completedState([]) },
      );

      expect(
        screen.queryByRole('button', { name: 'Save as template' }),
      ).not.toBeInTheDocument();
    });
  });
});
