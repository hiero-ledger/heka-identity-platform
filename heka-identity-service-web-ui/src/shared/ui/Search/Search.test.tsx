import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

jest.mock(
  '@/shared/assets/icons/visibility-off.svg',
  () => 'visibility-off.svg',
);
jest.mock(
  '@/shared/assets/icons/visibility-outline.svg',
  () => 'visibility-outline.svg',
);

import { Search } from './Search';

describe('Search', () => {
  test('debounces onSearch callback on input changes', async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    const onSearch = jest.fn();

    render(<Search onSearch={onSearch} debounceMs={300} />);

    await user.type(screen.getByPlaceholderText('Search'), 'ab');

    expect(onSearch).toHaveBeenCalledTimes(0);

    jest.advanceTimersByTime(299);
    expect(onSearch).toHaveBeenCalledTimes(0);

    jest.advanceTimersByTime(1);
    expect(onSearch).toHaveBeenCalledTimes(1);
    expect(onSearch).toHaveBeenLastCalledWith('ab');

    jest.useRealTimers();
  });
});
