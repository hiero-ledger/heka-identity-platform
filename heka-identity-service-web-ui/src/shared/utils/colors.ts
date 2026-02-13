export const getLuminance = (color?: string) => {
  const hex = color ? color.replace('#', '') : '000000';
  const rgb = parseInt(hex, 16);
  const r = (rgb >> 16) & 0xff; // Extract red
  const g = (rgb >> 8) & 0xff; // Extract green
  const b = rgb & 0xff; // Extract blue

  // Calculate luminance (perceived brightness)
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
};

export const isLightColor = (color?: string) => {
  return getLuminance(color) > 0.5;
};

export const calculateBorderColor = (backgroundColor?: string): string => {
  return isLightColor(backgroundColor)
    ? 'var(--color-dark-opacity-10)'
    : 'var(--color-light-opacity-20)';
};

export const getTextColor = (backgroundColor: string): string => {
  return isLightColor(backgroundColor) ? '#000' : '#fff';
};
