import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

jest.mock('@/shared/assets/icons/visibility-off.svg', () => 'visibility-off.svg');
jest.mock(
  '@/shared/assets/icons/visibility-outline.svg',
  () => 'visibility-outline.svg',
);

import { Search } from './Search';

describe('Search', () => {
  test('triggers onSearch callback on input changes', async () => {
    const user = userEvent.setup();
    const onSearch = jest.fn();

    render(<Search onSearch={onSearch} />);

    await user.type(screen.getByPlaceholderText('Search'), 'ab');

    expect(onSearch).toHaveBeenCalledTimes(2);
  });
});
