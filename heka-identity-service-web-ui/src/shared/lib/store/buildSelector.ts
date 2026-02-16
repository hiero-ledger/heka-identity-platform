import { useSelector } from 'react-redux';

import { StateSchema } from '@/app/providers/StoreProvider';

type Selector<T, Args extends unknown[]> = (
  state: StateSchema,
  ...args: Args
) => T;
type Hook<T, Args extends unknown[]> = (...args: Args) => T;
type Result<T, Args extends unknown[]> = [Hook<T, Args>, Selector<T, Args>];

export function buildSelector<T, Args extends unknown[]>(
  selector: Selector<T, Args>,
): Result<T, Args> {
  const useSelectorHook: Hook<T, Args> = (...args: Args) => {
    return useSelector((state: StateSchema) => selector(state, ...args));
  };

  return [useSelectorHook, selector];
}
