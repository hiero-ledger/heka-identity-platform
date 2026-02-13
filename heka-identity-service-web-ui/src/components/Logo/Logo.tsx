import { Button } from 'react-aria-components';

import HieroLogo from '@/shared/assets/icons/hiero-logo.svg';

import * as cls from './Logo.module.scss';

interface LogoProps {
  label: string;
  onClick?: () => void;
}

export const Logo = ({ label, onClick }: LogoProps) => {
  return (
    <Button
      className={cls.Logo}
      onPress={onClick}
      aria-label={label}
    >
      <HieroLogo
        height={"100%"}
        width={"100%"}
      />
    </Button>
  );
};
