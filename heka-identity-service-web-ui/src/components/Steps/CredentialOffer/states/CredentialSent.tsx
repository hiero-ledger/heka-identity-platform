import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { SaveIssuanceTemplateModal } from '@/components/SaveIssuanceTemplateModal';
import { CredentialOfferProps } from '@/components/Steps';
import IconCredentials from '@/shared/assets/icons/credentials.svg';
import SuccessIcon from '@/shared/assets/icons/success.svg';
import { Button } from '@/shared/ui/Button';
import { Column, Row } from '@/shared/ui/Grid';

import * as cls from '../CredentialOffer.module.scss';

export const CredentialSent = <T extends object>({
  context,
  stepDetails,
  onChangeStep,
}: CredentialOfferProps<T>) => {
  const [isTemplateModalOpen, setTemplateModalOpen] = useState(false);
  const { t } = useTranslation();

  return (
    <>
      <Column
        justifyContent="center"
        alignItems="center"
        className={cls.mainContent}
      >
        <Row className={cls.imageWrapper}>
          <IconCredentials
            height={230}
            width={240}
          />
          <SuccessIcon
            height={126}
            width={126}
            className={cls.successIcon}
          />
        </Row>
        <Row className={cls.title}>{t('Flow.titles.credentialSent')}</Row>
        <Column className={cls.buttonGroup}>
          <Button
            buttonType="outlined"
            onPress={() => onChangeStep(stepDetails.next?.name)}
          >
            {stepDetails.next?.title}
          </Button>
          {!context.useDemo && (
            <Button
              buttonType="text"
              onPress={() => setTemplateModalOpen(true)}
            >
              {t('Template.titles.main')}
            </Button>
          )}
        </Column>
      </Column>
      <SaveIssuanceTemplateModal
        context={context}
        isOpen={isTemplateModalOpen}
        onOpenChange={setTemplateModalOpen}
      />
    </>
  );
};
