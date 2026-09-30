import React, { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Outlet, useNavigate } from 'react-router-dom';

import ROUTES from '@/app/routes/RoutePaths';
import { Logo } from '@/components/Logo';
import { BasicPanel, TopPanel } from '@/components/Panel';
import { DesktopView, MobileView } from '@/components/Screen/Screen';
import { Button } from '@/shared/ui/Button';
import { Column, Row } from '@/shared/ui/Grid';

import * as cls from './UnauthenticatedLayout.module.scss';

const UnauthenticatedLayout = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const title = t('SignIn.titles.main');

  const onNavigateBack = useCallback(() => {
    navigate(ROUTES.MAIN);
  }, [navigate]);

  return (
    <Row className={cls.UnauthenticatedLayout}>
      <Row className={cls.body}>
        <DesktopView>
          <BasicPanel
            title={title}
            icon="wallet"
          />
        </DesktopView>
        <Column className={cls.content}>
          <Row alignItems="center">
            <Button
              onPress={onNavigateBack}
              buttonType="text"
              leftIcon="arrow-back"
              alignment={'left'}
            >
              <p>{t('Common.buttons.back')}</p>
            </Button>
          </Row>
          <Row justifyContent="center">
            <Logo
              label={t('Common.titles.logo')}
              onClick={() => navigate(ROUTES.MAIN)}
            />
          </Row>
          <MobileView>
            <TopPanel
              title={title}
              icon="wallet"
            />
          </MobileView>
          <Column
            className={cls.contentWrapper}
            justifyContent="center"
            alignItems="center"
          >
            <Outlet />
          </Column>
        </Column>
      </Row>
    </Row>
  );
};

export default UnauthenticatedLayout;
