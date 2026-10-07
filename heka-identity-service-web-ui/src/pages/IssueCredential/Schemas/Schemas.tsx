import { DndContext, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext } from '@dnd-kit/sortable';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch, useSelector } from 'react-redux';

import { AppDispatch } from '@/app/providers/StoreProvider';
import { RootState } from '@/app/providers/StoreProvider/config/store';
import { CreateSchemaModal } from '@/components/CreateSchema/CreateSchema';
import { useSortableSensors } from '@/components/Draggable/Draggable';
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
import { Button } from '@/shared/ui/Button';
import { Column, Row } from '@/shared/ui/Grid';
import { LoaderView } from '@/shared/ui/Loader';

import { EditorView } from './EditorView/EditorView';

import * as cls from './Schemas.module.scss';

export const Schemas = () => {
  const { schemas, isLoading } = useSelector(
    (state: RootState) => state.schemas,
  );
  const { t } = useTranslation();
  const dispatch: AppDispatch = useDispatch();

  const [localSchemas, setLocalSchemas] = useState(schemas ?? []);
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
    setLocalSchemas(schemas ?? []);
  }, [setLocalSchemas, isLoading, schemas]);

  useEffect(() => {
    if (schema?.id) {
      setCurrentSchema(schema.id);
    }
  }, [setCurrentSchema, localSchemas, schema?.id]);

  const handleStatusFilterChange = useCallback((value: boolean) => {
    setShowActiveSchemas(value);
  }, []);

  const sensors = useSortableSensors();

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;

      if (!over || active.id === over.id) return;

      // Resolve positions by id and compute the new order before updating state: a value
      // assigned inside a state updater is not guaranteed to be set when read right after
      const oldIndex = localSchemas.findIndex((s) => s.id === active.id);
      const newIndex = localSchemas.findIndex((s) => s.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;

      const previousOrder = localSchemas;
      const updatedOrder = arrayMove(localSchemas, oldIndex, newIndex);
      const prevSchemaId =
        newIndex === 0 ? null : String(updatedOrder[newIndex - 1].id);
      setLocalSchemas(updatedOrder);

      try {
        await dispatch(
          updateSchema({
            schemaId: String(active.id),
            params: { prevSchemaId },
          }),
        ).unwrap();
      } catch {
        // The thunk has already shown the error; put the list back as the server has it
        setLocalSchemas(previousOrder);
      }
    },
    [dispatch, localSchemas, setLocalSchemas],
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
          buttonType={showActiveSchemas ? 'elevated' : 'text'}
          aria-pressed={showActiveSchemas}
          onPress={() => handleStatusFilterChange(true)}
        >
          {t('IssueCredential.schema.filters.active')}
        </Button>
        <Button
          buttonType={showActiveSchemas ? 'text' : 'elevated'}
          aria-pressed={!showActiveSchemas}
          onPress={() => handleStatusFilterChange(false)}
        >
          {t('IssueCredential.schema.filters.hidden')}
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
            <DndContext
              sensors={sensors}
              onDragEnd={handleDragEnd}
            >
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
