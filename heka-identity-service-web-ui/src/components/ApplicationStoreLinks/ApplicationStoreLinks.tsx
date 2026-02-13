import React from 'react';

import { ApplicationStoreLink } from '@/components/ApplicationStoreLink';

type ApplicationStoreLinksProps = {
  className?: string;
};

export const ApplicationStoreLinks = ({
  className,
}: ApplicationStoreLinksProps) => {
  const applicationStoresUrls = {
    appStore: '',
    googlePlay: '',
  };
  return (
    <div className={className}>
      <ApplicationStoreLink
        store={'AppStore'}
        url={applicationStoresUrls.appStore}
      />
      <ApplicationStoreLink
        store={'GooglePlay'}
        url={applicationStoresUrls.googlePlay}
      />
    </div>
  );
};
