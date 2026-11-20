/** A date and time in the user's locale, e.g. "Nov 18, 2026, 11:51 AM"; empty for an unparsable value */
export const formatDateTime = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
};
