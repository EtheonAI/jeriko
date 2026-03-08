/**
 * Shared validation helpers for wizard steps.
 *
 * Each returns `undefined` on success or an error string on failure,
 * matching the WizardStep.validate signature.
 */

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmail(value: string): string | undefined {
  return EMAIL_PATTERN.test(value.trim()) ? undefined : "Must be a valid email address";
}

export function validateUrl(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
    return "Must be an HTTP(S) URL";
  }
  return undefined;
}

export function validateRequired(value: string): string | undefined {
  return value.trim().length < 1 ? "Required" : undefined;
}

export function validateMinLength(min: number, label = "Value") {
  return (value: string): string | undefined =>
    value.trim().length < min ? `${label} must be at least ${min} characters` : undefined;
}

export function validateDatetime(value: string): string | undefined {
  const d = new Date(value.trim());
  if (isNaN(d.getTime())) return "Invalid date. Use ISO format: YYYY-MM-DDTHH:MM";
  return undefined;
}

export function validateSkillName(value: string): string | undefined {
  const trimmed = value.trim();
  if (trimmed.length < 2) return "Name must be at least 2 characters";
  if (!/^[a-z0-9][a-z0-9-]*$/.test(trimmed)) return "Use lowercase letters, numbers, and hyphens";
  return undefined;
}

/** Extract error message from unknown catch value. */
export function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
