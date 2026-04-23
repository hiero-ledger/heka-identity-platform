import { useCallback, useEffect, useRef } from 'react';

import { TextInputUncontrolled } from '@/shared/ui/TextInput';

import * as cls from './Search.module.scss';

const DEBOUNCE_DELAY = 300;

interface SearchProps {
  onSearch: (value: string) => void;
}

export const Search = ({ onSearch }: SearchProps) => {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  const handleChange = useCallback(
    (value: string) => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      timerRef.current = setTimeout(() => {
        onSearch(value);
      }, DEBOUNCE_DELAY);
    },
    [onSearch],
  );

  return (
    <div className={cls.SearchWrapper}>
      <TextInputUncontrolled
        label="Search"
        onChange={handleChange}
      />
    </div>
  );
};