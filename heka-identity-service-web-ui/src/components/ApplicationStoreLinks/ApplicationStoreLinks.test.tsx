import { render, screen } from '@testing-library/react';

import { ApplicationStoreLink } from '@/components/ApplicationStoreLink';

import { ApplicationStoreLinks } from './ApplicationStoreLinks';

describe('ApplicationStoreLink', () => {
  test.each(['AppStore', 'GooglePlay'] as const)(
    'renders a %s link opening in a new tab',
    (store) => {
      render(
        <ApplicationStoreLink
          store={store}
          url="https://store.example/app"
          width={100}
          height={30}
        />,
      );

      const link = screen.getByRole('link');
      expect(link).toHaveAttribute('href', 'https://store.example/app');
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noreferrer');
    },
  );
});

describe('ApplicationStoreLinks', () => {
  test('renders both store links', () => {
    const { container } = render(<ApplicationStoreLinks className="links" />);

    expect(container.firstChild).toHaveClass('links');
    expect(container.querySelectorAll('a')).toHaveLength(2);
  });
});
