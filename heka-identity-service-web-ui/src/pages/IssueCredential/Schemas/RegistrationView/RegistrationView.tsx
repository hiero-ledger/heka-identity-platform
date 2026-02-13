import { useCallback, useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { useSelector } from 'react-redux';

import { DidMethods } from '@/components/Steps/SelectNetwork/SelectNetwork.const';
import { ProtocolType, Schema } from '@/entities/Schema';
import { selectSchemaLoading } from '@/entities/Schema/model/selectors/schemasSelector';
import { registerSchema } from '@/entities/Schema/model/services/registerSchema';
import { CredentialRegistrationFormat } from '@/entities/Schema/model/types/schema';
import {
  RegisterSchemaFormData,
  RegisterSchemaFormDefaultValues,
} from '@/pages/IssueCredential/Schemas/RegistrationView/RegisterSchema.form';
import { ApiError, errorMessage } from '@/shared/api/utils/error';
import { useAppDispatch } from '@/shared/lib/hooks/useAppDispatch';
import { Button } from '@/shared/ui/Button/Button';
import { FormSelect } from '@/shared/ui/FormSelect';
import { Row } from '@/shared/ui/Grid';
import { Modal } from '@/shared/ui/Modal/Modal';
import { SelectOption } from '@/shared/ui/Select';

import * as cls from './RegistrationView.module.scss';

interface RegistrationViewProps {
  schema: Schema;
  isOpen: boolean;
  onOpenChange: (value: boolean) => void;
  possibleRegistrations: RegisterSchemaFormData[];
}

export const RegistrationView = ({
  schema,
  isOpen,
  onOpenChange,
  possibleRegistrations,
}: RegistrationViewProps) => {
  const dispatch = useAppDispatch();
  const { t } = useTranslation();

  const { id: schemaId } = schema;
  const isLoading = useSelector(selectSchemaLoading);

  const [isCredentialFormatDisabled, setIsCredentialFormatDisabled] =
    useState<boolean>(true);
  const [isNetworkDisabled, setIsNetworkDisabled] = useState<boolean>(true);
  const [isDidDisabled, setIsDidDisabled] = useState<boolean>(true);

  const {
    control,
    handleSubmit,
    register,
    clearErrors,
    reset,
    resetField,
    watch,
    getValues,
    setValue,
  } = useForm<RegisterSchemaFormData>({
    defaultValues: RegisterSchemaFormDefaultValues,
    mode: 'onSubmit',
    reValidateMode: 'onSubmit',
  });

  const resetForm = useCallback(() => {
    reset(RegisterSchemaFormDefaultValues);
    setIsCredentialFormatDisabled(true);
    setIsNetworkDisabled(true);
    setIsDidDisabled(true);
  }, [reset]);

  const [protocol, credentialFormat, network] = watch([
    'protocol',
    'credentialFormat',
    'network',
  ]);

  const formComplete = useCallback(() => {
    const { protocol, credentialFormat, network, did } = getValues();
    return protocol && credentialFormat && network && did;
  }, [getValues]);

  const handleRegisterSchema = useCallback(
    async (data: RegisterSchemaFormData) => {
      try {
        await dispatch(
          registerSchema({
            schemaId: schemaId,
            protocol: data!.protocol as string,
            credentialFormat: data!.credentialFormat as string,
            network: data!.network as string,
            did: data!.did as string,
          }),
        ).unwrap();
        toast.success(
          t('IssueCredential.schema.registrationDetails.messages.success'),
        );
        resetForm();
        onOpenChange(false);
      } catch (error) {
        toast.error(
          errorMessage(
            (error as ApiError).response?.data.message ??
              'Unknown server error',
          ),
        );
      }
    },
    [dispatch, schemaId, onOpenChange, resetForm, t],
  );

  const toSelectOptions = useCallback((array: string[]) => {
    return array
      .filter((value, index, self) => self.indexOf(value) === index)
      .sort()
      .map((item) => ({ value: item, content: item }) as SelectOption);
  }, []);

  const protocols = useMemo((): Array<SelectOption> => {
    const items = possibleRegistrations.map((item) => item.protocol as string);
    return toSelectOptions(items);
  }, [possibleRegistrations, toSelectOptions]);

  const credentialFormats = useMemo((): Array<SelectOption> => {
    const filteredList = possibleRegistrations.filter(
      (item) => item.protocol === protocol,
    );
    const items = filteredList.map((item) => item.credentialFormat as string);
    return toSelectOptions(items);
  }, [possibleRegistrations, protocol, toSelectOptions]);

  const networks = useMemo((): Array<SelectOption> => {
    const filteredList = possibleRegistrations.filter(
      (item) =>
        item.protocol === protocol &&
        item.credentialFormat === credentialFormat,
    );
    const items = filteredList.map((item) => item.network as string);
    return toSelectOptions(items);
  }, [possibleRegistrations, protocol, credentialFormat, toSelectOptions]);

  const dids = useMemo((): Array<SelectOption> => {
    const filteredList = possibleRegistrations.filter(
      (item) =>
        item.protocol === protocol &&
        item.credentialFormat === credentialFormat &&
        item.network === network,
    );
    const items = filteredList.map((item) => item.did as string);
    return toSelectOptions(items);
  }, [
    possibleRegistrations,
    protocol,
    credentialFormat,
    network,
    toSelectOptions,
  ]);

  useEffect(() => {
    resetForm();
  }, [resetForm]);

  useEffect(() => {
    setIsCredentialFormatDisabled(!protocol);
    setIsNetworkDisabled(!credentialFormat);
    setIsDidDisabled(!network);
  }, [
    setIsCredentialFormatDisabled,
    setIsNetworkDisabled,
    setIsDidDisabled,
    protocol,
    credentialFormat,
    network,
  ]);

  useEffect(() => {
    resetField('credentialFormat');
  }, [resetField, protocol]);

  useEffect(() => {
    resetField('network');
  }, [resetField, credentialFormat]);

  useEffect(() => {
    resetField('did');
  }, [resetField, network]);

  useEffect(() => {
    setValue(
      'protocol',
      protocols.length === 1 ? (protocols[0].value as ProtocolType) : undefined,
    );
  }, [protocols, setValue]);

  useEffect(() => {
    setValue(
      'credentialFormat',
      credentialFormats.length === 1
        ? (credentialFormats[0].value as CredentialRegistrationFormat)
        : undefined,
    );
  }, [credentialFormats, setValue]);

  useEffect(() => {
    setValue(
      'network',
      networks.length === 1 ? (networks[0].value as DidMethods) : undefined,
    );
  }, [networks, setValue]);

  useEffect(() => {
    setValue('did', dids.length === 1 ? (dids[0].value as string) : undefined);
  }, [dids, setValue]);

  return (
    <Modal
      isOpen={isOpen}
      title={t('IssueCredential.schema.registrationDetails.title')}
      handleToggle={(isOpen) => {
        if (!isOpen) resetForm();
        onOpenChange(isOpen);
      }}
    >
      <form onSubmit={handleSubmit(handleRegisterSchema)}>
        <FormSelect
          {...register('protocol')}
          control={control}
          clearErrors={clearErrors}
          placeholder={t('IssueCredential.schema.registrationDetails.protocol')}
          className={cls.formElement}
          items={protocols}
        />
        {
          <FormSelect
            {...register('credentialFormat')}
            control={control}
            clearErrors={clearErrors}
            placeholder={t(
              'IssueCredential.schema.registrationDetails.credentialFormat',
            )}
            className={cls.formElement}
            items={credentialFormats}
            isDisabled={isCredentialFormatDisabled}
          />
        }
        <FormSelect
          {...register('network')}
          control={control}
          clearErrors={clearErrors}
          placeholder={t('IssueCredential.schema.registrationDetails.network')}
          className={cls.formElement}
          items={networks}
          isDisabled={isNetworkDisabled}
        />
        <FormSelect
          {...register('did')}
          control={control}
          clearErrors={clearErrors}
          placeholder={t('IssueCredential.schema.registrationDetails.did')}
          className={cls.formElement}
          items={dids}
          isDisabled={isDidDisabled}
        />
        <Row className={cls.submitBtn}>
          <Button
            type="submit"
            isDisabled={!formComplete()}
            isLoading={isLoading}
            fullWidth
          >
            {t('IssueCredential.schema.registrationDetails.buttons.submit')}
          </Button>
        </Row>
      </form>
    </Modal>
  );
};
