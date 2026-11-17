import { useCallback } from 'react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { useDispatch } from 'react-redux';

import { AppDispatch } from '@/app/providers/StoreProvider/config/store';
import ROUTES from '@/app/routes/RoutePaths';
import { Templates } from '@/components/Templates';
import { TemplateType } from '@/components/Templates/types';
import { VerificationTemplate } from '@/entities/VerificationTemplate';
import { useGetVerificationTemplateListQuery } from '@/entities/VerificationTemplate/api/verificationTemplateApi';
import { deleteVerificationTemplate } from '@/entities/VerificationTemplate/model/services/deleteVerificationTemplate';
import { updateVerificationTemplate } from '@/entities/VerificationTemplate/model/services/updateVerificationTemplate';

// Stable while the list loads: `Templates` copies the list into local state on every change
const NO_TEMPLATES: VerificationTemplate[] = [];

export const VerificationTemplates = () => {
  const { t } = useTranslation();
  const dispatch: AppDispatch = useDispatch();

  // Cached; the reorder and delete thunks invalidate it, so it refetches once after each
  const {
    data: templates,
    isLoading,
    error,
  } = useGetVerificationTemplateListQuery();

  const changeTemplateOrder = useCallback(
    async (templateId: string, previousTemplateId: string | null) => {
      await dispatch(
        updateVerificationTemplate({
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
          deleteVerificationTemplate({
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
      templateType={TemplateType.Verification}
      changeTemplateOrder={changeTemplateOrder}
      deleteTemplate={onDeleteTemplate}
      navigateOnCreateTemplate={ROUTES.VERIFY_TEMPLATE}
      navigateOnEditTemplate={ROUTES.VERIFY_TEMPLATE}
      navigateOnOpenTemplate={ROUTES.VERIFY_CREDENTIAL_FROM_TEMPLATE}
    />
  );
};
