import { renderHook } from '@testing-library/react';

import { useLatest } from './useLatest';

describe('useLatest', () => {
  test('keeps one ref that always holds the latest value', () => {
    const first = jest.fn();
    const second = jest.fn();
    const { result, rerender } = renderHook(({ value }) => useLatest(value), {
      initialProps: { value: first },
    });
    const ref = result.current;
    expect(ref.current).toBe(first);

    rerender({ value: second });

    expect(result.current).toBe(ref);
    expect(ref.current).toBe(second);
  });
});
