import type { KeyboardEvent } from 'react';

export interface ClickableOptions {
  /** Accessible name, for elements whose content does not name them (e.g. an icon) */
  label?: string;
  /** `button` (default) activates on Enter and Space; `link` on Enter, like a native link */
  role?: 'button' | 'link' | 'radio';
  /** For `role="radio"`: whether this option is the selected one */
  checked?: boolean;
  disabled?: boolean;
}

/**
 * Props that make a non-interactive element (a `div`, a grid `Row`, an SVG icon) behave like a
 * button for keyboard and assistive technology users: a role, a tab stop, an accessible name and
 * Enter/Space activation. Use where swapping in a native or react-aria button would change the
 * markup the styles depend on.
 */
export const clickableProps = (
  onActivate: () => void,
  { label, role = 'button', checked, disabled }: ClickableOptions = {},
) => ({
  role,
  tabIndex: disabled ? -1 : 0,
  'aria-label': label,
  'aria-disabled': disabled || undefined,
  'aria-checked': role === 'radio' ? !!checked : undefined,
  onClick: disabled ? undefined : onActivate,
  onKeyDown: (event: KeyboardEvent<Element>) => {
    if (disabled) return;
    const activates =
      event.key === 'Enter' || (role !== 'link' && event.key === ' ');
    if (!activates) return;
    event.preventDefault();
    onActivate();
  },
});
