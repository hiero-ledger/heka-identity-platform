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
import { deleteIssuanceTemplate } from '@/entities/IssuanceTemplate/model/services/deleteIssuanceTemplate';
import { getIssuanceTemplateList } from '@/entities/IssuanceTemplate/model/services/getIssuanceTemplateList';
import { updateIssuanceTemplate } from '@/entities/IssuanceTemplate/model/services/updateIssuanceTemplate';

export const IssueTemplates = () => {
  const { t } = useTranslation();
  const dispatch: AppDispatch = useDispatch();

  const templatesState = useSelector(
    (state: RootState) => state.issuanceTemplates,
  );

  useEffect(() => {
    dispatch(getIssuanceTemplateList());
  }, [dispatch]);

  const changeTemplateOrder = useCallback(
    async (templateId: string, previousTemplateId?: string) => {
      await dispatch(
        updateIssuanceTemplate({
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
        deleteIssuanceTemplate({
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
        templates: templatesState.issuanceTemplates!,
        error: templatesState.error!,
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
