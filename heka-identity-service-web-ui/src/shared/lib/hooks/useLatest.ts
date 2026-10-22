import { MutableRefObject, useLayoutEffect, useRef } from 'react';

/**
 * A ref that always holds the latest `value`. Lets an effect or a stable callback call a
 * function prop (or read an object) that the caller re-creates on every render, without listing
 * it as a dependency and re-running on each render. The ref is updated before effects run.
 */
export const useLatest = <T>(value: T): MutableRefObject<T> => {
  const ref = useRef(value);
  // A layout effect, not useEffect: all layout effects run before any useEffect, so every effect
  // sees the latest value regardless of hook order or component nesting. Not assigned during
  // render, since a render can be discarded without committing.
  useLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
};
