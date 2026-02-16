import { DndContext, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext } from '@dnd-kit/sortable';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { NoItemFound } from '@/components/NoItemFound/NoItemFound';
import { DesktopView } from '@/components/Screen/Screen';
import { Template } from '@/components/Template/Template';
import { IssuanceTemplate } from '@/entities/IssuanceTemplate';
import { VerificationTemplate } from '@/entities/VerificationTemplate';
import useConfirmDialog from '@/shared/ui/ConfirmDialog';
import { Column, Row } from '@/shared/ui/Grid';
import { LoaderView } from '@/shared/ui/Loader';

import { TemplatesProps, TemplateType } from './types';
import { PlusButton } from '../PlusButton';

import * as cls from './Templates.module.scss';

export const Templates = ({
  templatesState,
  templateType,
  changeTemplateOrder,
  deleteTemplate,
  navigateOnCreateTemplate,
  navigateOnEditTemplate,
  navigateOnOpenTemplate,
}: TemplatesProps) => {
  const navigate = useNavigate();
  const { t } = useTranslation();

  const { templates, isLoading, error } = templatesState;

  const [localTemplates, setLocalTemplates] = useState(templates ?? []);

  const [deletingTemplateId, setDeletingTemplateId] = useState<
    string | undefined
  >(undefined);

  const templateDetails = (
    template: IssuanceTemplate | VerificationTemplate,
  ) => {
    if (templateType === TemplateType.Issue)
      return t('Template.details.issuance', {
        ...(template as IssuanceTemplate),
      });
    else if (templateType === TemplateType.Verification)
      return t('Template.details.verification', {
        ...(template as VerificationTemplate),
      });
    else return '';
  };

  useEffect(() => {
    if (templates) setLocalTemplates(templates);
  }, [templates]);

  const { ConfirmDialog, confirm } = useConfirmDialog({
    text: t('Template.confirmation.deleteTemplate'),
    cancelButtonText: t('Template.buttons.cancelConfirm'),
    acceptButtonText: t('Template.buttons.deleteConfirm'),
    onAccept: async () => {
      if (deletingTemplateId) await deleteTemplate(deletingTemplateId);
      setDeletingTemplateId(undefined);
    },
    onCancel: async () => {
      setDeletingTemplateId(undefined);
    },
  });

  const confirmTemplateDeleting = async (templateId: string) => {
    setDeletingTemplateId(templateId);
    confirm();
  };

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;

      if (!over || active.id === over.id) return;

      const oldIndex = event.active.data.current?.sortable.index ?? 0;
      const newIndex = event.over?.data.current?.sortable.index ?? 0;

      let previousTemplateId;
      setLocalTemplates((templates) => {
        const updatedLocalTemplates = arrayMove(templates, oldIndex, newIndex);
        previousTemplateId =
          newIndex === 0 ? null : updatedLocalTemplates[newIndex - 1].id;
        return updatedLocalTemplates;
      });

      await changeTemplateOrder(String(active.id), previousTemplateId);
    },
    [changeTemplateOrder],
  );

  const onClickTemplate = useCallback(
    (templateId: string) => {
      navigate(navigateOnOpenTemplate, {
        state: {
          context: {
            templateId,
          },
        },
      });
    },
    [navigate, navigateOnOpenTemplate],
  );

  const onEditTemplate = useCallback(
    (templateId: string) => {
      navigate(navigateOnEditTemplate, {
        state: {
          context: {
            templateId,
          },
        },
      });
    },
    [navigate, navigateOnEditTemplate],
  );

  return (
    <Column className={cls.TemplatesWrapper}>
      <Row className={cls.templatesHeaderWrapper}>
        <Row className={cls.templatesHeaderLeft}>
          <p className={cls.schemaTitle}>{t('Common.titles.templates')}</p>
          <PlusButton
            title={t('Template.buttons.create')}
            onPress={() => navigate(navigateOnCreateTemplate)}
          />
        </Row>
      </Row>
      {isLoading && <LoaderView />}
      {!!error && !isLoading && <h2>{t('Common.titles.smthWentWrong')}</h2>}
      {!isLoading && !error && (
        <div className={cls.templateItemsContainer}>
          {localTemplates.length === 0 && (
            <DesktopView>
              <NoItemFound
                title={t('Template.titles.noTemplates')}
                description={t('Template.titles.noTemplatesDescription', {
                  templateType,
                })}
                buttonTitle={t('Template.buttons.create', {
                  templateType,
                })}
                onClick={() => navigate(navigateOnCreateTemplate)}
              />
            </DesktopView>
          )}
          {localTemplates.length > 0 && (
            <DndContext onDragEnd={handleDragEnd}>
              <SortableContext items={localTemplates}>
                {localTemplates.map((template) => (
                  <Template
                    key={template.id}
                    id={template.id}
                    title={template.name}
                    targetDescription={templateDetails(template)}
                    onClick={onClickTemplate}
                    onEdit={onEditTemplate}
                    onDelete={confirmTemplateDeleting}
                  />
                ))}
              </SortableContext>
            </DndContext>
          )}
        </div>
      )}
      <ConfirmDialog />
    </Column>
  );
};
