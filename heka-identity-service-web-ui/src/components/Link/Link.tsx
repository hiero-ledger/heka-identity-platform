import React from 'react';

import * as cls from './Link.module.scss';

interface LinkProps {
  text: string;
  onClick?: () => void;
}

export const Link = ({ text, onClick }: LinkProps) => {
  return (
    <button
      className={cls.Link}
      onClick={onClick}
    >
      {text}
    </button>
  );
};
