import { act, render, screen } from '@testing-library/react';
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
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  test('does not call onSearch immediately and fires once after debounce with final query', async () => {
    const onSearch = jest.fn();

    const user = userEvent.setup({
      advanceTimers: jest.advanceTimersByTime,
    });

    render(<Search onSearch={onSearch} debounceMs={300} />);

    await user.type(screen.getByPlaceholderText('Search'), 'ab');

    expect(onSearch).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(300);
    });

    expect(onSearch).toHaveBeenCalledTimes(1);
    expect(onSearch).toHaveBeenCalledWith('ab');
  });
});