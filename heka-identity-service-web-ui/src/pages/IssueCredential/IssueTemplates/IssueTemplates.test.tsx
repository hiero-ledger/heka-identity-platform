import { act, screen, waitFor } from '@testing-library/react';
import toast from 'react-hot-toast';

import ROUTES from '@/app/routes/RoutePaths';
import { TemplatesProps, TemplateType } from '@/components/Templates/types';
import {
  createMockApi,
  renderWithProviders,
} from '@/shared/lib/tests/renderWithProviders';

import { issuanceTemplate, routeAgencyGets } from '../testUtils';
import { IssueTemplates } from './IssueTemplates';

jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: { success: jest.fn(), error: jest.fn() },
}));

// The list UI is tested on its own; here only the wiring to the store matters
let templatesProps: TemplatesProps | undefined;
jest.mock('@/components/Templates', () => ({
  Templates: (props: TemplatesProps) => {
    templatesProps = props;
    return (
      <div>
        {props.templatesState.isLoading && 'loading'}
        {props.templatesState.templates?.map((template) => (
          <span key={template.id}>{template.name}</span>
        ))}
      </div>
    );
  },
}));

const renderIssueTemplates = () => {
  const api = createMockApi();
  routeAgencyGets(api);
  return renderWithProviders(<IssueTemplates />, { api });
};

describe('IssueTemplates', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    templatesProps = undefined;
  });

  test('loads the issuance templates and configures the list', async () => {
    const { api } = renderIssueTemplates();

    expect(await screen.findByText(issuanceTemplate.name)).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith(
      '/issuance-templates',
      expect.anything(),
    );
    expect(templatesProps).toMatchObject({
      templateType: TemplateType.Issue,
      navigateOnCreateTemplate: ROUTES.ISSUE_TEMPLATE,
      navigateOnEditTemplate: ROUTES.ISSUE_TEMPLATE,
      navigateOnOpenTemplate: ROUTES.ISSUE_CREDENTIAL_FROM_TEMPLATE,
    });
  });

  test('moves a template after the previous one', async () => {
    const { api } = renderIssueTemplates();
    await screen.findByText(issuanceTemplate.name);

    await act(() => templatesProps!.changeTemplateOrder('t2', 't1'));

    expect(api.patch).toHaveBeenCalledWith(
      '/issuance-templates/t2',
      expect.objectContaining({ previousTemplateId: 't1' }),
    );
  });

  test('rejects the reorder when the update fails', async () => {
    const { api } = renderIssueTemplates();
    await screen.findByText(issuanceTemplate.name);
    api.patch.mockRejectedValueOnce({
      response: { data: { message: 'Conflict' } },
    });

    await act(async () => {
      await expect(
        templatesProps!.changeTemplateOrder('t2', null),
      ).rejects.toBe('Conflict');
    });
  });

  test('deletes a template and confirms it', async () => {
    const { api } = renderIssueTemplates();
    await screen.findByText(issuanceTemplate.name);

    await act(() => templatesProps!.deleteTemplate(issuanceTemplate.id));

    expect(api.delete).toHaveBeenCalledWith(
      `/issuance-templates/${issuanceTemplate.id}`,
    );
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('Template was deleted'),
    );
  });

  test('does not confirm a delete that failed', async () => {
    const { api } = renderIssueTemplates();
    await screen.findByText(issuanceTemplate.name);
    api.delete.mockRejectedValueOnce({
      response: { data: { message: 'Not found' } },
    });

    await act(() => templatesProps!.deleteTemplate(issuanceTemplate.id));

    expect(toast.error).toHaveBeenCalledWith('Not found');
    expect(toast.success).not.toHaveBeenCalled();
  });
});
