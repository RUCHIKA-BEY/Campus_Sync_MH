// Client-side validation gives fast feedback. The database re-checks
// everything (CHECK constraints, triggers), so these are for UX only.

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const REGNO_RE = /^[A-Za-z0-9]{4,20}$/;
export const PHONE_RE = /^\+?[0-9 ]{7,20}$/;

export function validatePassword(password: string, confirm?: string): string | null {
  if (password.length < 8) return 'Password must be at least 8 characters.';
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) return 'Password must include a letter and a number.';
  if (confirm !== undefined && password !== confirm) return 'The two passwords do not match.';
  return null;
}

export function initials(name: string | null | undefined): string {
  const parts = (name ?? '').split(/[\s@._-]+/).filter(Boolean).slice(0, 2);
  return parts.map(p => p[0]!.toUpperCase()).join('') || '?';
}
