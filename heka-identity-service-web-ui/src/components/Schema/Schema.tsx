import { useSortable } from '@dnd-kit/sortable';
import React, { useCallback, useMemo } from 'react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { useDispatch } from 'react-redux';

import { AppDispatch } from '@/app/providers/StoreProvider';
import { Draggable, DraggableArea } from '@/components/Draggable/Draggable';
import { defaultSchemaBackgroundColor } from '@/const/color';
import { defaultLogoImagePath } from '@/const/image';
import { changeSchemaVisibility } from '@/entities/Schema/model/services/changeSchemaVisibility';
import EqualIcon from '@/shared/assets/icons/equal.svg';
import VisibilityOffIcon from '@/shared/assets/icons/visibility-off.svg';
import VisibilityOutlineIcon from '@/shared/assets/icons/visibility-outline.svg';
import { Column, Row } from '@/shared/ui/Grid';
import { PopupMenu } from '@/shared/ui/PopupMenu';
import { calculateBorderColor, getTextColor } from '@/shared/utils/colors';

import { SchemaProps } from './types';

import * as cls from './Schema.module.scss';

export const Schema = ({
  schema,
  onVisibilityChanged,
  onChange,
  onRegistrationsClick,
}: SchemaProps) => {
  const dispatch: AppDispatch = useDispatch();

  const { t } = useTranslation();
  const { id, name, isHidden, registrationsCount, bgColor } = schema;

  const sortable = useSortable({ id });

  const { backgroundColor, textColor } = useMemo(() => {
    const backgroundColor = bgColor ?? defaultSchemaBackgroundColor;
    return {
      backgroundColor,
      textColor: getTextColor(backgroundColor),
    };
  }, [bgColor]);

  const style = useMemo(() => {
    return {
      backgroundColor,
      color: textColor,
      ...(isHidden && { opacity: 0.65 }),
    };
  }, [isHidden, backgroundColor, textColor]);

  const handleVisibleIconToggle = useCallback(async () => {
    await dispatch(
      changeSchemaVisibility({
        schemaId: String(schema.id),
        params: { isHidden: !schema.isHidden },
      }),
    );
    toast.success(
      t(
        schema.isHidden
          ? 'IssueCredential.schema.activated'
          : 'IssueCredential.schema.hidden',
      ),
    );
    onVisibilityChanged(schema);
  }, [dispatch, schema, t, onVisibilityChanged]);

  const imageBorder = useMemo(() => {
    return calculateBorderColor(backgroundColor);
  }, [backgroundColor]);

  return (
    <Draggable
      className={cls.SchemaWrapper}
      style={style}
      sortable={sortable}
    >
      <Row
        className={cls.schemaHeaderWrapper}
        justifyContent="space-between"
        alignItems="center"
        style={{ borderColor: imageBorder }}
      >
        {!isHidden && (
          <>
            <div title={t('IssueCredential.schema.hints.hide')}>
              <VisibilityOutlineIcon
                className={cls.schemaVisibleOrOffIcon}
                style={{ stroke: textColor, strokeWidth: 0.6 }}
                onClick={handleVisibleIconToggle}
              />
            </div>
            <Column
              justifyContent="center"
              alignItems="center"
              className={cls.menuIconWrapper}
            >
              <PopupMenu
                buttonHint={t('IssueCredential.schema.hints.manage')}
                buttonClassName={cls.menuButton}
                buttonStyle={{ color: textColor }}
                popupPlacement="bottom left"
                items={[
                  {
                    iconName: 'edit',
                    caption: t('IssueCredential.schema.actions.edit'),
                    onAction: () => onChange(id),
                  },
                  {
                    iconName: 'register',
                    caption: t('IssueCredential.schema.actions.register'),
                    onAction: () => onRegistrationsClick(id),
                  },
                ]}
              ></PopupMenu>
            </Column>
          </>
        )}
        {isHidden && (
          <div title={t('IssueCredential.schema.hints.show')}>
            <VisibilityOffIcon
              className={cls.schemaVisibleOrOffIcon}
              style={{ stroke: textColor, strokeWidth: 0.6 }}
              onClick={handleVisibleIconToggle}
            />
          </div>
        )}

        <DraggableArea sortable={sortable}>
          <div title={t('IssueCredential.schema.hints.move')}>
            <EqualIcon
              className={cls.schemaEqualIcon}
              style={{ stroke: textColor, strokeWidth: 0.6 }}
            />
          </div>
        </DraggableArea>
      </Row>

      <Column className={cls.schemaBodyWrapper}>
        <Row
          className={cls.schemaLogoContainer}
          onClick={() => onChange(id)}
        >
          <img
            src={schema.logo ?? defaultLogoImagePath}
            alt="Logo"
            style={{ borderColor: imageBorder }}
          />
        </Row>

        <Column className={cls.schemaBottomContainer}>
          <div
            className={cls.schemaBottomTitle}
            title={name}
            onClick={() => onChange(id)}
          >
            {name}
          </div>
          <div
            className={cls.schemaBottomRegister}
            title={t('IssueCredential.schema.hints.registrations')}
            onClick={() => onRegistrationsClick(id)}
          >
            {registrationsCount && registrationsCount > 0
              ? t('IssueCredential.schema.registered', {
                  count: registrationsCount,
                })
              : t('IssueCredential.schema.notRegistered')}
          </div>
        </Column>
      </Column>
    </Draggable>
  );
};
