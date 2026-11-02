import { StoryFn } from '@storybook/react';
import { BrowserRouter } from 'react-router-dom';

import { routerFuture } from '@/shared/config/router';

export const RouterDecorator = (StoryComponent: StoryFn<object>) => (
  <BrowserRouter future={routerFuture}>
    <StoryComponent />
  </BrowserRouter>
);
