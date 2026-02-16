import { useCallback, useEffect } from 'react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { useDispatch, useSelector } from 'react-redux';

import {
  AppDispatch,
  RootState,
} from '@/app/providers/StoreProvider/config/store';
import ROUTES from '@/app/routes/RoutePaths';
import { Templates } from '@/components/Templates';
import { TemplateType } from '@/components/Templates/types';
import { deleteVerificationTemplate } from '@/entities/VerificationTemplate/model/services/deleteVerificationTemplate';
import { getVerificationTemplateList } from '@/entities/VerificationTemplate/model/services/getVerificationTemplateList';
import { updateVerificationTemplate } from '@/entities/VerificationTemplate/model/services/updateVerificationTemplate';

export const VerificationTemplates = () => {
  const { t } = useTranslation();
  const dispatch: AppDispatch = useDispatch();

  const templatesState = useSelector(
    (state: RootState) => state.verificationTemplates,
  );

  useEffect(() => {
    dispatch(getVerificationTemplateList());
  }, [dispatch]);

  const changeTemplateOrder = useCallback(
    async (templateId: string, previousTemplateId?: string) => {
      await dispatch(
        updateVerificationTemplate({
          templateId,
          params: {
            previousTemplateId,
          },
        }),
      );
    },
    [dispatch],
  );

  const onDeleteTemplate = useCallback(
    async (templateId: string) => {
      await dispatch(
        deleteVerificationTemplate({
          templateId,
        }),
      );
      toast.success(t('Template.messages.deleted'));
    },
    [dispatch, t],
  );

  return (
    <Templates
      templatesState={{
        isLoading: templatesState.isLoading,
        templates: templatesState.verificationTemplates!,
        error: templatesState.error!,
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
