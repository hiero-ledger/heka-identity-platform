import { act, screen, waitFor } from '@testing-library/react';
import toast from 'react-hot-toast';

import ROUTES from '@/app/routes/RoutePaths';
import { TemplatesProps, TemplateType } from '@/components/Templates/types';
import { makeVerificationTemplate } from '@/pages/VerifyCredential/testUtils';
import { requestsTo } from '@/shared/lib/tests/apiCache';
import {
  createMockApi,
  renderWithProviders,
} from '@/shared/lib/tests/renderWithProviders';

import { VerificationTemplates } from './VerificationTemplates';

// The list UI is covered by its own tests; capture what the page hands to it
let templatesProps: TemplatesProps;
jest.mock('@/components/Templates', () => ({
  Templates: (props: TemplatesProps) => {
    templatesProps = props;
    return (
      <ul>
        {props.templatesState.isLoading && <li>loading</li>}
        {props.templatesState.templates?.map((template) => (
          <li key={template.id}>{template.name}</li>
        ))}
      </ul>
    );
  },
}));

const templates = [
  makeVerificationTemplate({ id: 'tpl-1', name: 'KYC check' }),
  makeVerificationTemplate({ id: 'tpl-2', name: 'Age check' }),
];

/** The identity service: a delete removes the template from later list answers */
const renderPage = () => {
  const api = createMockApi();
  let stored = [...templates];
  api.get.mockImplementation(() =>
    Promise.resolve({ data: { items: stored } }),
  );
  api.delete.mockImplementation((url: string) => {
    stored = stored.filter((t) => !url.endsWith(`/${t.id}`));
    return Promise.resolve({ data: undefined });
  });
  return renderWithProviders(<VerificationTemplates />, { api });
};

const listRequests = (api: ReturnType<typeof createMockApi>) =>
  requestsTo(api, '/verification-templates');

describe('VerificationTemplates', () => {
  test('loads the verification templates into the list', async () => {
    const { api } = renderPage();

    expect(await screen.findByText('KYC check')).toBeInTheDocument();
    expect(screen.getByText('Age check')).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('/verification-templates', {
      params: undefined,
    });
    expect(templatesProps).toEqual(
      expect.objectContaining({
        templateType: TemplateType.Verification,
        navigateOnCreateTemplate: ROUTES.VERIFY_TEMPLATE,
        navigateOnEditTemplate: ROUTES.VERIFY_TEMPLATE,
        navigateOnOpenTemplate: ROUTES.VERIFY_CREDENTIAL_FROM_TEMPLATE,
      }),
    );
  });

  test('deletes a template and confirms it', async () => {
    const success = jest.spyOn(toast, 'success');
    const { api } = renderPage();
    await screen.findByText('KYC check');

    await act(() => templatesProps.deleteTemplate('tpl-1'));

    expect(api.delete).toHaveBeenCalledWith('/verification-templates/tpl-1');
    expect(success).toHaveBeenCalledWith('Template was deleted');
    // The list is read again once, without the deleted template
    await waitFor(() =>
      expect(screen.queryByText('KYC check')).not.toBeInTheDocument(),
    );
    expect(screen.getByText('Age check')).toBeInTheDocument();
    expect(listRequests(api)).toBe(2);
  });

  test('reads the list from the cache when the page is opened again', async () => {
    const { api, store, unmount } = renderPage();
    await screen.findByText('KYC check');
    unmount();

    renderWithProviders(<VerificationTemplates />, { api, store });

    expect(screen.getByText('KYC check')).toBeInTheDocument();
    expect(listRequests(api)).toBe(1);
  });

  test('keeps the template when deleting fails', async () => {
    const success = jest.spyOn(toast, 'success');
    const { api } = renderPage();
    api.delete.mockRejectedValue({ response: { data: { message: 'Busy' } } });
    await screen.findByText('KYC check');

    await act(() => templatesProps.deleteTemplate('tpl-1'));

    expect(success).not.toHaveBeenCalled();
    expect(screen.getByText('KYC check')).toBeInTheDocument();
    expect(listRequests(api)).toBe(1);
  });

  test('saves a new template order', async () => {
    const { api } = renderPage();
    await screen.findByText('KYC check');

    await act(() => templatesProps.changeTemplateOrder('tpl-2', null));

    expect(api.patch).toHaveBeenCalledWith(
      '/verification-templates/tpl-2',
      expect.objectContaining({ previousTemplateId: null }),
    );
    // The saved order is read back once
    await waitFor(() => expect(listRequests(api)).toBe(2));
  });

  test('propagates a failed reorder so the list can roll back', async () => {
    const { api } = renderPage();
    api.patch.mockRejectedValue({ response: { data: { message: 'No' } } });
    await screen.findByText('KYC check');

    await act(() =>
      expect(templatesProps.changeTemplateOrder('tpl-2', 'tpl-1')).rejects.toBe(
        'No',
      ),
    );
  });
});
