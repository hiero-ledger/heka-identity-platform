import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Input, Label, TextField } from 'react-aria-components';
import { useTranslation } from 'react-i18next';

import { Button } from '@/shared/ui/Button';
import { Column, Row } from '@/shared/ui/Grid';
import * as inputCls from '@/shared/ui/TextInput/TextInput.module.scss';

import * as cls from './ConnectionChoice.module.scss';

export const CONNECTION_NAME_MAX_LENGTH = 64;

export interface ConnectionNameInputProps {
  value: string;
  isDisabled?: boolean;
  onApply: (alias: string) => void;
}

export const ConnectionNameInput = ({
  value,
  isDisabled,
  onApply,
}: ConnectionNameInputProps) => {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const onSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (isDisabled) return;
      onApply(draft.trim());
    },
    [draft, isDisabled, onApply],
  );

  const label = t('Connection.titles.name');

  return (
    <form
      className={cls.nameForm}
      onSubmit={onSubmit}
    >
      <Column className={cls.nameColumn}>
        <Row className={cls.nameRow}>
          <TextField
            className={inputCls.inputWrapper}
            isDisabled={isDisabled}
            value={draft}
            onChange={setDraft}
            maxLength={CONNECTION_NAME_MAX_LENGTH}
            aria-label={label}
          >
            <div className={inputCls.labelInputWrapper}>
              <Input
                className={inputCls.input}
                placeholder={label}
              />
              <Label className={inputCls.label}>
                <div className={inputCls.label_content}>{label}</div>
              </Label>
            </div>
          </TextField>
          <Button
            type="submit"
            buttonType="outlined"
            isDisabled={isDisabled || draft.trim() === value}
          >
            {t('Connection.buttons.apply')}
          </Button>
        </Row>
        <p className={cls.hint}>{t('Connection.titles.nameHint')}</p>
      </Column>
    </form>
  );
};
