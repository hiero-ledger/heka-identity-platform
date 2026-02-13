import { DndContext, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext } from '@dnd-kit/sortable';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch, useSelector } from 'react-redux';

import { AppDispatch } from '@/app/providers/StoreProvider';
import { RootState } from '@/app/providers/StoreProvider/config/store';
import { CreateSchemaModal } from '@/components/CreateSchema/CreateSchema';
import { NoItemFound } from '@/components/NoItemFound/NoItemFound';
import { PlusButton } from '@/components/PlusButton';
import { Schema } from '@/components/Schema/Schema';
import { SchemaItem } from '@/components/Schema/types';
import { DesktopView } from '@/components/Screen/Screen';
import { defaultSchemaBackgroundColor } from '@/const/color';
import { defaultLogoImagePath } from '@/const/image';
import { Schema as SchemaType } from '@/entities/Schema';
import { getSchemaList } from '@/entities/Schema/model/services/getSchemaList';
import { updateSchema } from '@/entities/Schema/model/services/updateSchema';
import { RegistrationsList } from '@/pages/IssueCredential/Schemas/RegistrationsList/RegistrationsList';
import { Button, ButtonType } from '@/shared/ui/Button';
import { Column, Row } from '@/shared/ui/Grid';
import { LoaderView } from '@/shared/ui/Loader';

import { EditorView } from './EditorView/EditorView';

import * as cls from './Schemas.module.scss';

export const Schemas = () => {
  const { schemas = [], isLoading } = useSelector(
    (state: RootState) => state.schemas,
  );
  const { t } = useTranslation();
  const dispatch: AppDispatch = useDispatch();

  const [localSchemas, setLocalSchemas] = useState(schemas);
  const [schema, setSchema] = useState<null | SchemaType>(null);
  const [isEditorModalOpen, setIsEditorModalOpen] = useState(false);
  const [isRegistrationsModalOpen, setRegistrationsModalOpen] = useState(false);
  const [showActiveSchemas, setShowActiveSchemas] = useState<boolean>(true);
  const [isCreateSchemaModalOpen, setIsCreateSchemaModalOpen] =
    useState<boolean>(false);

  const setCurrentSchema = useCallback(
    (schemaId: string) => {
      const chosenSchema = localSchemas.find(
        (schema) => schema.id === schemaId,
      );
      if (!chosenSchema) return;
      setSchema({
        ...chosenSchema,
        logo: chosenSchema.logo ?? defaultLogoImagePath,
        bgColor: chosenSchema.bgColor ?? defaultSchemaBackgroundColor,
      });
    },
    [localSchemas, setSchema],
  );

  useEffect(() => {
    dispatch(
      getSchemaList({
        isHidden: !showActiveSchemas,
      }),
    );
  }, [dispatch, showActiveSchemas]);

  useEffect(() => {
    setLocalSchemas(schemas);
  }, [setLocalSchemas, isLoading]);

  useEffect(() => {
    if (schema?.id) {
      setCurrentSchema(schema.id);
    }
  }, [setCurrentSchema, localSchemas, schema?.id]);

  const handleStatusFilterChange = useCallback((value: boolean) => {
    setShowActiveSchemas(value);
  }, []);

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;

      if (!over || active.id === over.id) return;

      const oldIndex = event.active.data.current?.sortable.index ?? 0;
      const newIndex = event.over?.data.current?.sortable.index ?? 0;

      let prevSchemaId;
      setLocalSchemas((schemas) => {
        const updatedLocalSchemas = arrayMove(schemas, oldIndex, newIndex);
        prevSchemaId =
          newIndex === 0 ? null : updatedLocalSchemas[newIndex - 1].id;
        return updatedLocalSchemas;
      });

      await dispatch(
        updateSchema({
          schemaId: String(active.id),
          params: { prevSchemaId },
        }),
      );
    },
    [dispatch, setLocalSchemas],
  );

  const showSchemaEditForm = useCallback(
    (schemaId: string) => {
      setCurrentSchema(schemaId);
      setIsEditorModalOpen(true);
    },
    [setCurrentSchema],
  );

  const showSchemaRegistrations = useCallback(
    (schemaId: string) => {
      setCurrentSchema(schemaId);
      setRegistrationsModalOpen(true);
    },
    [setCurrentSchema],
  );

  const handleSchemaVisibilityChanged = useCallback(
    async (schema: SchemaItem) => {
      setLocalSchemas((schemas) => schemas.filter((s) => s.id !== schema.id));
    },
    [],
  );

  const onSchemaCreated = useCallback(() => {
    handleStatusFilterChange(true);
    dispatch(
      getSchemaList({
        isHidden: false,
      }),
    );
  }, [dispatch, handleStatusFilterChange]);

  const reloadList = useCallback(() => {
    dispatch(
      getSchemaList({
        isHidden: !showActiveSchemas,
      }),
    );
  }, [dispatch, showActiveSchemas]);

  return (
    <Column className={cls.schemasWrapper}>
      <Row className={cls.schemasHeaderWrapper}>
        <p className={cls.schemaTitle}>{t('Common.titles.schemas')}</p>
        <PlusButton
          title={t('IssueCredential.schema.create')}
          onPress={() => {
            setShowActiveSchemas(true);
            setIsCreateSchemaModalOpen(true);
          }}
        />
        <CreateSchemaModal
          isOpen={isCreateSchemaModalOpen}
          onOpenChange={(value: boolean) => {
            setIsCreateSchemaModalOpen(value);
            reloadList();
          }}
          onSchemaCreated={onSchemaCreated}
        />
      </Row>

      <Row
        className={cls.schemaButtonsContainer}
        justifyContent="space-between"
      >
        <Button
          buttonType={
            showActiveSchemas
              ? (t('Common.buttons.elevatedType') as ButtonType)
              : (t('Common.buttons.textType') as ButtonType)
          }
          onPress={() => handleStatusFilterChange(true)}
        >
          Active
        </Button>
        <Button
          buttonType={
            !showActiveSchemas
              ? (t('Common.buttons.elevatedType') as ButtonType)
              : (t('Common.buttons.textType') as ButtonType)
          }
          onPress={() => handleStatusFilterChange(false)}
        >
          Hidden
        </Button>
      </Row>

      {isLoading && <LoaderView />}
      {!isLoading && (
        <Row
          justifyContent="flex-start"
          className={cls.schemaItemsContainer}
        >
          {!isLoading && localSchemas.length === 0 && (
            <DesktopView>
              {showActiveSchemas && (
                <NoItemFound
                  title={t('IssueCredential.schema.noSchemas')}
                  description={t('IssueCredential.schema.noSchemasDescription')}
                  buttonTitle={t('IssueCredential.schema.noSchemasButtonTitle')}
                  onClick={() => setIsCreateSchemaModalOpen(true)}
                />
              )}
              {!showActiveSchemas && (
                <NoItemFound
                  title={t('IssueCredential.schema.noHiddenSchemas')}
                />
              )}
            </DesktopView>
          )}
          {localSchemas.length > 0 && (
            <DndContext onDragEnd={handleDragEnd}>
              <SortableContext items={localSchemas}>
                {localSchemas.map((schema) => (
                  <Schema
                    key={schema.id}
                    schema={schema}
                    onVisibilityChanged={handleSchemaVisibilityChanged}
                    onChange={showSchemaEditForm}
                    onRegistrationsClick={showSchemaRegistrations}
                  />
                ))}
              </SortableContext>
            </DndContext>
          )}
        </Row>
      )}
      {schema && (
        <EditorView
          schema={schema}
          isOpen={isEditorModalOpen}
          onOpenChange={setIsEditorModalOpen}
        />
      )}
      {schema && (
        <RegistrationsList
          schema={schema}
          isOpen={isRegistrationsModalOpen}
          onOpenChange={setRegistrationsModalOpen}
        />
      )}
    </Column>
  );
};
