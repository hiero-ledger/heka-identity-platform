/**
 * The jest `matchMedia` polyfill evaluates width queries against `window.innerWidth`, so
 * changing it before rendering switches `react-responsive` between mobile and desktop views.
 */
export const setViewportWidth = (width: number) => {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    writable: true,
    value: width,
  });
};
