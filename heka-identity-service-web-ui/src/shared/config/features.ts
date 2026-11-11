/**
 * Build-time feature flags. dotenv-webpack replaces each `process.env.REACT_APP_*` expression,
 * so every variable is referenced explicitly. A flag only hides UI; the identity service still
 * decides who may call an endpoint.
 */

const DISABLED_VALUES = ['false', '0', 'off'];

/** `defaultValue` for an unset or empty value; `false` only for `false`, `0` or `off` */
export const flag = (value: string | undefined, defaultValue: boolean) => {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return defaultValue;
  return !DISABLED_VALUES.includes(normalized);
};

export const features = {
  /** "Issued credentials" list with credential revocation */
  revocation: flag(process.env.REACT_APP_FEATURE_REVOCATION, true),
};
