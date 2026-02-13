import { StoryFn } from '@storybook/react';
import { BrowserRouter } from 'react-router-dom';

export const RouterDecorator = (StoryComponent: StoryFn<object>) => (
  <BrowserRouter>
    <StoryComponent />
  </BrowserRouter>
);
