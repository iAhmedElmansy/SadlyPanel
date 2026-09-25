import { getAllSettings } from "../settings";
import { SETTING_KEYS } from "../constants";
import { DEFAULT_PASSWORD_POLICY, type PasswordPolicy } from "../validation";

/**
 * Reads the configurable password policy from the security.* settings, falling
 * back to DEFAULT_PASSWORD_POLICY for any missing/invalid value. Pass the result
 * to buildPasswordSchema() so every auth flow enforces the same rules.
 */
export async function getPasswordPolicy(): Promise<PasswordPolicy> {
  const all = await getAllSettings();
  const asBool = (key: string, fallback: boolean): boolean => {
    const value = all[key];
    if (value === undefined) return fallback;
    return value === "true";
  };
  const minRaw = Number(all[SETTING_KEYS.passwordMinLength]);
  const minLength = Number.isFinite(minRaw) && minRaw >= 1 ? Math.trunc(minRaw) : DEFAULT_PASSWORD_POLICY.minLength;

  return {
    minLength,
    requireUpper: asBool(SETTING_KEYS.passwordRequireUpper, DEFAULT_PASSWORD_POLICY.requireUpper),
    requireLower: asBool(SETTING_KEYS.passwordRequireLower, DEFAULT_PASSWORD_POLICY.requireLower),
    requireNumber: asBool(SETTING_KEYS.passwordRequireNumber, DEFAULT_PASSWORD_POLICY.requireNumber),
    requireSymbol: asBool(SETTING_KEYS.passwordRequireSymbol, DEFAULT_PASSWORD_POLICY.requireSymbol),
  };
}
