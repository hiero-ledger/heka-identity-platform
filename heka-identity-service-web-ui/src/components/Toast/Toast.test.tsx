import { render, screen } from '@testing-library/react';
import { Toast as ReactToast } from 'react-hot-toast';

import { Toast } from './Toast';

const makeToast = (overrides: Partial<ReactToast>): ReactToast =>
  ({
    id: '1',
    type: 'blank',
    message: 'Hello',
    visible: true,
    createdAt: 0,
    pauseDuration: 0,
    ariaProps: { role: 'status', 'aria-live': 'polite' },
    ...overrides,
  }) as ReactToast;

describe('Toast', () => {
  test.each(['success', 'error', 'blank'] as const)(
    'renders a %s message',
    (type) => {
      render(<Toast toast={makeToast({ type, message: `${type} message` })} />);

      expect(screen.getByText(`${type} message`)).toBeInTheDocument();
    },
  );

  test('resolves function messages', () => {
    render(
      <Toast
        toast={makeToast({ id: '42', message: (t) => `Toast ${t.id}` })}
      />,
    );

    expect(screen.getByText('Toast 42')).toBeInTheDocument();
  });
});
