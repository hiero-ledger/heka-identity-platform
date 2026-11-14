import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';

import ROUTES from '@/app/routes/RoutePaths';
import { useGetProfileQuery } from '@/entities/User/api/userApi';
import {
  getIsPreparingUser,
  getIsWalletPrepared,
  getUserIsSignedIn,
} from '@/entities/User/model/selectors/userSelector';
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
  const isWalletPrepared = useSelector(getIsWalletPrepared);

  // Only a signed-in user has an agency profile to fetch (the hook skips it for a visitor,
  // whose request would be rejected). The profile is cached, so coming back to Home does not
  // fetch it again.
  const {
    data: profile,
    isLoading: isUserFetching,
    isSuccess,
  } = useGetProfileQuery();
  const registeredAt = profile?.registeredAt;

  // Prepare the wallet until a preparation leaves no DID `failed`: at most one attempt per
  // visit, so a failure is retried on the next visit rather than in a loop
  const preparationHandled = useRef(false);
  useEffect(() => {
    if (!isSignedIn || preparationHandled.current) return;
    preparationHandled.current = true;
    if (!isWalletPrepared && !isPreparingUser) {
      dispatch(prepareWallet());
    }
  }, [isSignedIn, isWalletPrepared, isPreparingUser, dispatch]);

  // A user who has never registered is sent to their profile, decided from the profile itself
  useEffect(() => {
    if (isSuccess && !profile?.registeredAt) navigate(ROUTES.PROFILE);
  }, [isSuccess, profile, navigate]);

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
          <Button
            onPress={() => navigate(ROUTES.AGE_DEMO)}
            isDisabled={isPreparingUser && !isUserFetching}
          >
            {t('Home.buttons.ageVerification')}
          </Button>
        </>
      )}
      {!registeredAt && isUserFetching && <Loader />}
    </Column>
  );
};

export default Home;
