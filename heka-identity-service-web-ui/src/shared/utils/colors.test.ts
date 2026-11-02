import {
  calculateBorderColor,
  getLuminance,
  getTextColor,
  isLightColor,
} from './colors';

describe('colors', () => {
  test.each([
    ['#ffffff', 1],
    ['000000', 0],
    [undefined, 0],
    ['#ff0000', 0.299],
  ])('getLuminance(%s) = %d', (color, expected) => {
    expect(getLuminance(color)).toBeCloseTo(expected, 3);
  });

  test.each([
    ['#ffffff', true, '#000', 'var(--color-dark-opacity-10)'],
    ['#171717', false, '#fff', 'var(--color-light-opacity-20)'],
    ['#00ff00', true, '#000', 'var(--color-dark-opacity-10)'],
    ['#0000ff', false, '#fff', 'var(--color-light-opacity-20)'],
  ])('%s: light=%s, text %s, border %s', (color, light, text, border) => {
    expect(isLightColor(color)).toBe(light);
    expect(getTextColor(color)).toBe(text);
    expect(calculateBorderColor(color)).toBe(border);
  });

  test('a missing background counts as dark', () => {
    expect(calculateBorderColor()).toBe('var(--color-light-opacity-20)');
  });
});
