// The rule every employee password has to pass, worded for the screen that asks for it. The
// server applies the same rule when the password is saved, so a screen can only warn earlier,
// never allow less.
export const MIN_PASSWORD_LENGTH = 10;

// '' when the password is acceptable, otherwise the name of the rule it broke.
export function passwordProblem(value) {
  const password = String(value || '');
  if (password.length < MIN_PASSWORD_LENGTH) return 'length';
  if (!/[A-Z]/.test(password)) return 'upper';
  if (!/[a-z]/.test(password)) return 'lower';
  if (!/[0-9]/.test(password)) return 'number';
  if (!/[^A-Za-z0-9]/.test(password)) return 'symbol';
  return '';
}