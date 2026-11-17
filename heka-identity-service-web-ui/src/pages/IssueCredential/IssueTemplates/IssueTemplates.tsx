import { useCallback } from 'react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { useDispatch } from 'react-redux';

import { AppDispatch } from '@/app/providers/StoreProvider/config/store';
import ROUTES from '@/app/routes/RoutePaths';
import { Templates } from '@/components/Templates';
import { TemplateType } from '@/components/Templates/types';
import { IssuanceTemplate } from '@/entities/IssuanceTemplate';
import { useGetIssuanceTemplateListQuery } from '@/entities/IssuanceTemplate/api/issuanceTemplateApi';
import { deleteIssuanceTemplate } from '@/entities/IssuanceTemplate/model/services/deleteIssuanceTemplate';
import { updateIssuanceTemplate } from '@/entities/IssuanceTemplate/model/services/updateIssuanceTemplate';

// Stable while the list loads: `Templates` copies the list into local state on every change
const NO_TEMPLATES: IssuanceTemplate[] = [];

export const IssueTemplates = () => {
  const { t } = useTranslation();
  const dispatch: AppDispatch = useDispatch();

  // Cached; the reorder and delete thunks invalidate it, so it refetches once after each
  const {
    data: templates,
    isLoading,
    error,
  } = useGetIssuanceTemplateListQuery();

  const changeTemplateOrder = useCallback(
    async (templateId: string, previousTemplateId: string | null) => {
      await dispatch(
        updateIssuanceTemplate({
          templateId,
          params: {
            previousTemplateId,
          },
        }),
      ).unwrap();
    },
    [dispatch],
  );

  const onDeleteTemplate = useCallback(
    async (templateId: string) => {
      try {
        await dispatch(
          deleteIssuanceTemplate({
            templateId,
          }),
        ).unwrap();
      } catch {
        // The thunk has already shown the error
        return;
      }
      toast.success(t('Template.messages.deleted'));
    },
    [dispatch, t],
  );

  return (
    <Templates
      templatesState={{
        isLoading,
        templates: templates ?? NO_TEMPLATES,
        error: error?.message ?? '',
      }}
      templateType={TemplateType.Issue}
      changeTemplateOrder={changeTemplateOrder}
      deleteTemplate={onDeleteTemplate}
      navigateOnCreateTemplate={ROUTES.ISSUE_TEMPLATE}
      navigateOnEditTemplate={ROUTES.ISSUE_TEMPLATE}
      navigateOnOpenTemplate={ROUTES.ISSUE_CREDENTIAL_FROM_TEMPLATE}
    />
  );
};
