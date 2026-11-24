/**
 * Build-time feature flags. dotenv-webpack replaces each `process.env.REACT_APP_*` expression,
 * so every variable is referenced explicitly. A flag only hides UI; the identity service still
 * decides who may call an endpoint.
 */

/**
 * `true` or `false` (trimmed, any case), as for the services' boolean settings; `defaultValue`
 * when unset or empty. Any other value throws, so a typo can't silently keep a feature on.
 */
export const flag = (
  name: string,
  value: string | undefined,
  defaultValue: boolean,
) => {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return defaultValue;
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  throw new Error(`${name} must be "true" or "false", got "${value}"`);
};

export const features = {
  /** "Issued credentials" list with credential revocation */
  revocation: flag(
    'REACT_APP_FEATURE_REVOCATION',
    process.env.REACT_APP_FEATURE_REVOCATION,
    true,
  ),
  /**
   * Contributor Hub: GitHub account linking, GPG proof and the contributor credential offer. The
   * identity service serves its routes only with CONTRIBUTOR_VERIFICATION_ENABLED=true.
   */
  contributorVerification: flag(
    'REACT_APP_FEATURE_CONTRIBUTOR_VERIFICATION',
    process.env.REACT_APP_FEATURE_CONTRIBUTOR_VERIFICATION,
    false,
  ),
};
