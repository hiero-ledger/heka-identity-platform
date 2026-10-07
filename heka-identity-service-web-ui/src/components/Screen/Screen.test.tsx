import { render, renderHook, screen } from '@testing-library/react';

import { setViewportWidth } from '@/components/testUtils/viewport';

import {
  DesktopView,
  MobileView,
  useDesktop,
  useMobile,
  useTablet,
} from './Screen';

const renderViews = () =>
  render(
    <>
      <DesktopView>desktop</DesktopView>
      <MobileView>mobile</MobileView>
    </>,
  );

describe('Screen', () => {
  afterEach(() => setViewportWidth(1024));

  test('shows the desktop view on wide screens', () => {
    renderViews();

    expect(screen.getByText('desktop')).toBeInTheDocument();
    expect(screen.queryByText('mobile')).not.toBeInTheDocument();
    expect(renderHook(() => useDesktop()).result.current).toBe(true);
    expect(renderHook(() => useMobile()).result.current).toBe(false);
  });

  test('shows the mobile view on narrow screens', () => {
    setViewportWidth(400);

    renderViews();

    expect(screen.getByText('mobile')).toBeInTheDocument();
    expect(screen.queryByText('desktop')).not.toBeInTheDocument();
    expect(renderHook(() => useMobile()).result.current).toBe(true);
    expect(renderHook(() => useTablet()).result.current).toBe(false);
  });

  test('detects tablets', () => {
    setViewportWidth(800);

    expect(renderHook(() => useTablet()).result.current).toBe(true);
    expect(renderHook(() => useDesktop()).result.current).toBe(false);
  });
});
