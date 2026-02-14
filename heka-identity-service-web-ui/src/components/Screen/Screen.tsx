import React from 'react';
import { useMediaQuery } from 'react-responsive';

interface ScreenProps {
  children: React.ReactNode;
}

const breakpoints = {
  tablet: 640,
  desktop: 1024,
};

export const useDesktop = () => {
  return useMediaQuery({ minWidth: breakpoints.desktop });
};

export const useMobile = () => {
  return useMediaQuery({ maxWidth: breakpoints.tablet });
};

export const useTablet = () => {
  return useMediaQuery({
    minWidth: breakpoints.tablet,
    maxWidth: breakpoints.desktop,
  });
};

export const DesktopView = ({ children }: ScreenProps) => {
  const isDesktop = useMediaQuery({ minWidth: breakpoints.desktop });
  return isDesktop ? children : null;
};

export const MobileView = ({ children }: ScreenProps) => {
  const isMobile = useMediaQuery({ maxWidth: breakpoints.desktop - 1 }); // IDK is it correct way but fixes bug with displaying on IPad Pro mode in Dev tools
  return isMobile ? children : null;
};
