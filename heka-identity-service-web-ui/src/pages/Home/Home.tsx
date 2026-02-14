import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';

import ROUTES from '@/app/routes/RoutePaths';
import {
  getIsPreparingUser,
  getUser,
  getUserIsSignedIn,
} from '@/entities/User/model/selectors/userSelector';
import { getAgencyUser } from '@/entities/User/model/services/getAgencyUser';
import { prepareWallet } from '@/entities/User/model/services/prepareWallet';
import WalletImage from '@/shared/assets/icons/wallet-new.svg';
import { useAppDispatch } from '@/shared/lib/hooks/useAppDispatch';
import { Button } from '@/shared/ui/Button';
import { Column, Row } from '@/shared/ui/Grid';
import { Loader } from '@/shared/ui/Loader';

import * as cls from './Home.module.scss';

// This component fetches User.registeredAt to detect if a user signed in for the first time
// It yes, we redirect them to Profile page
const Home = () => {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const { t } = useTranslation();

  const isSignedIn = useSelector(getUserIsSignedIn);
  const isPreparingUser = useSelector(getIsPreparingUser);
  const user = useSelector(getUser);

  const [isUserFetching, setIsUserFetching] = useState(true);

  const registeredAt = useMemo(() => {
    return user?.registeredAt;
  }, [user]);

  useEffect(() => {
    if (isSignedIn) {
      dispatch(prepareWallet());
    }
  }, [isSignedIn, dispatch]);

  useEffect(() => {
    dispatch(getAgencyUser()).then(() => setIsUserFetching(false));
  }, [dispatch, isUserFetching]);

  useEffect(() => {
    if (isSignedIn && !isUserFetching && !registeredAt) {
      navigate(ROUTES.PROFILE);
    }
  }, [isSignedIn, isUserFetching, navigate, registeredAt]);

  return (
    <Column
      className={cls.Home}
      justifyContent="center"
      alignItems="center"
    >
      {(!isUserFetching || registeredAt) && (
        <>
          {/*<ApplicationStoreLinks className={cls.storeLinks} />*/}
          <WalletImage
            height={240}
            width={240}
          />
          <Column
            className={cls.textWrapper}
            justifyContent="center"
            alignItems="center"
          >
            <Row className={cls.title}>{t('Home.titles.main')}</Row>
            <Row className={cls.description}>
              {t('Home.titles.description')}
            </Row>
          </Column>
          <Button
            onPress={() => navigate(ROUTES.DEMO)}
            isDisabled={isPreparingUser && !isUserFetching}
          >
            {t('Home.buttons.start')}
          </Button>
        </>
      )}
      {!registeredAt && isUserFetching && <Loader />}
    </Column>
  );
};

export default Home;
