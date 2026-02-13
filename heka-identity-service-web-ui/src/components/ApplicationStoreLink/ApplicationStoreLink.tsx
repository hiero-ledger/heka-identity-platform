import React, { ReactElement } from 'react';

import GooglePlay from '@/shared/assets/icons/android_app_download.svg';
import AppStore from '@/shared/assets/icons/ios_app_download.svg';

export type ApplicationStore = 'AppStore' | 'GooglePlay';

const ApplicationStoreLogo: {
  [name in ApplicationStore]: (width?: number, height?: number) => ReactElement;
} = {
  AppStore: (width?: number, height?: number) => (
    <AppStore
      height={height ?? 40}
      width={width ?? 120}
    />
  ),
  GooglePlay: (width?: number, height?: number) => (
    <GooglePlay
      height={height ?? 40}
      width={width ?? 120}
    />
  ),
};

type ApplicationStoreLinkProps = {
  store: ApplicationStore;
  url: string;
  width?: number;
  height?: number;
};

export const ApplicationStoreLink = ({
  store,
  url,
  height,
  width,
}: ApplicationStoreLinkProps) => {
  return (
    <a
      href={url}
      target={'_blank'}
      rel="noreferrer"
    >
      {ApplicationStoreLogo[store](height, width)}
    </a>
  );
};
