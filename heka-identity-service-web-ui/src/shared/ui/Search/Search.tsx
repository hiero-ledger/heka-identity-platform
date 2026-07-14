import { useEffect, useState } from 'react';

import { TextInputUncontrolled } from '@/shared/ui/TextInput';

import * as cls from './Search.module.scss';

interface SearchProps {
  onSearch: (query: string) => void;
  debounceMs?: number;
}

export const Search = ({ onSearch, debounceMs = 300 }: SearchProps) => {
  const [query, setQuery] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => {
      onSearch(query);
    }, debounceMs);

    return () => clearTimeout(timer);
  }, [debounceMs, onSearch, query]);

  return (
    <div className={cls.SearchWrapper}>
      <TextInputUncontrolled // Implemented Debounce Search
        label="Search"
        initValue={query}
        onChange={setQuery}
        className={cls.searchInput}
      />
    </div>
  );
};
