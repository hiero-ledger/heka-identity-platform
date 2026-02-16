import { TextInputUncontrolled } from '@/shared/ui/TextInput';

import * as cls from './Search.module.scss';

interface SearchProps {
  onSearch: () => void;
}

export const Search = ({ onSearch }: SearchProps) => {
  return (
    <div className={cls.SearchWrapper}>
      <TextInputUncontrolled
        label="Search"
        onChange={onSearch} // TODO: use debounce
      />
    </div>
  );
};
