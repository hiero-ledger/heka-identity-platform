import { useSortable } from '@dnd-kit/sortable';
import React, { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { Draggable, DraggableArea } from '@/components/Draggable/Draggable';
import EqualIcon from '@/shared/assets/icons/equal.svg';
import { classNames } from '@/shared/lib/classNames';
import { Column, Row } from '@/shared/ui/Grid';
import { PopupMenu } from '@/shared/ui/PopupMenu';

import * as cls from './Template.module.scss';

export interface TemplateProps {
  id: string;
  title: string;
  targetDescription: string;
  onClick: (id: string) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}

export const Template = ({
  title,
  id,
  targetDescription,
  onClick,
  onEdit,
  onDelete,
}: TemplateProps) => {
  const { t } = useTranslation();
  const sortable = useSortable({ id });

  const onEditTemplate = useCallback(() => {
    onEdit(id);
  }, [id, onEdit]);

  const onDeleteTemplate = useCallback(() => {
    onDelete(id);
  }, [id, onDelete]);

  return (
    <Draggable
      sortable={sortable}
      className={classNames(cls.TemplateWrapper, {
        [cls.TemplateWrapperDragging]: sortable.isDragging,
      })}
    >
      <Row className={cls.headerIcons}>
        <Column
          justifyContent="center"
          alignItems="center"
          className={classNames(cls.menuIconWrapper, {}, [cls.iconWrapper])}
        >
          <PopupMenu
            buttonHint={t('Template.hints.manage')}
            buttonClassName={cls.menuButton}
            popupPlacement="bottom left"
            items={[
              {
                caption: t('Template.buttons.edit'),
                onAction: onEditTemplate,
                className: cls.editButton,
                iconName: 'edit',
              },
              {
                caption: t('Template.buttons.delete'),
                onAction: onDeleteTemplate,
                className: cls.deleteButton,
                iconName: 'delete',
              },
            ]}
          ></PopupMenu>
        </Column>
        <DraggableArea
          sortable={sortable}
          className={classNames(cls.dragIconWrapper, {}, [cls.iconWrapper])}
        >
          <div title={t('Template.hints.move')}>
            <EqualIcon className={cls.templateEqualIcon} />
          </div>
        </DraggableArea>
      </Row>
      <Row
        onClick={() => onClick(id)}
        className={cls.cardBody}
      >
        <p
          className={cls.templateTitle}
          title={targetDescription}
        >
          {title}
        </p>
      </Row>
    </Draggable>
  );
};
