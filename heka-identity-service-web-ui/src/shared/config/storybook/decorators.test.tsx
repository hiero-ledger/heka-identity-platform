import { StoryFn } from '@storybook/react';
import { render, screen } from '@testing-library/react';
import { useSelector } from 'react-redux';
import { useLocation } from 'react-router-dom';

import { StateSchema } from '@/app/providers/StoreProvider';

import { RouterDecorator } from './RouterDecorator/RouterDecorator';
import { StoreDecorator } from './StoreDecorator/StoreDecorator';
import { StyleDecorator } from './StyleDecorator/StyleDecorator';
import { SuspenseDecorator } from './SuspenseDecorator/SuspenseDecorator';

const Story = (() => <span>story</span>) as StoryFn;

describe('storybook decorators', () => {
  test('RouterDecorator provides a router', () => {
    const PathStory = (() => <span>{useLocation().pathname}</span>) as StoryFn;

    render(RouterDecorator(PathStory as StoryFn<object>));

    expect(screen.getByText('/')).toBeInTheDocument();
  });

  test('StoreDecorator provides a store with the given state', () => {
    const NameStory = (() => (
      <span>
        {useSelector((state: StateSchema) => state.user.data?.name ?? '-')}
      </span>
    )) as StoryFn;
    const Decorator = StoreDecorator({ user: { data: { name: 'Ada' } } });

    render(Decorator(NameStory));

    expect(screen.getByText('Ada')).toBeInTheDocument();
  });

  test('StyleDecorator and SuspenseDecorator render the story', () => {
    render(StyleDecorator(Story));
    render(SuspenseDecorator(Story));

    expect(screen.getAllByText('story')).toHaveLength(2);
  });
});
