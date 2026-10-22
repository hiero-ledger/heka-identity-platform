import { useEffect } from 'react';
import { useSelector } from 'react-redux';

import { getUserIsSignedIn } from '@/entities/User/model/selectors/userSelector';

import { connect, disconnect } from './notificationClient';

/** Holds one notifications socket per tab for as long as the user is signed in. */
export const NotificationsConnector = () => {
  const isSignedIn = useSelector(getUserIsSignedIn);

  useEffect(() => {
    if (!isSignedIn) return;
    connect();
    return () => disconnect();
  }, [isSignedIn]);

  return null;
};
