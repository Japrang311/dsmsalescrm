/** Shared password validation for create-account, reset-password, and change-password flows.
 * Single source of truth so all three stay consistent and can be tightened together. */
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 128;

export function isValidPassword(value: string): boolean {
  return (
    value.length >= MIN_PASSWORD_LENGTH && value.length <= MAX_PASSWORD_LENGTH
  );
}

export function passwordsMatch(password: string, confirm: string): boolean {
  return password.length > 0 && password === confirm;
}
