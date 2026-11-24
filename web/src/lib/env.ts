// Public build-time configuration.
//
// Vite copies ONLY variables prefixed with VITE_ into browser code, so the
// secret key in the same .env file can never be bundled. The two values
// below are public by design: security comes from GRANTs + RLS in the
// database, not from hiding them.

/** True if a key looks like a SECRET (server-only) key. */
export function looksLikeSecretKey(key: string): boolean {
  if (key.startsWith('sb_secret_')) return true;
  if (key.startsWith('eyJ')) {
    // Legacy JWT-style keys: inspect the role claim.
    try {
      const payload = JSON.parse(atob(key.split('.')[1]!.replace(/-/g, '+').replace(/_/g, '/')));
      return payload.role === 'service_role';
    } catch {
      return false;
    }
  }
  return false;
}

const url = (import.meta.env.VITE_SUPABASE_URL ?? '').trim();
const key = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '').trim();

/** Set when the configured key is a secret key; the app then refuses to use it. */
export const configError = key && looksLikeSecretKey(key)
  ? 'A SECRET Supabase key was placed in VITE_SUPABASE_PUBLISHABLE_KEY. It has been ignored. Use the publishable key and rotate the secret key.'
  : null;

export const SUPABASE_URL = url;
export const SUPABASE_PUBLISHABLE_KEY = configError ? '' : key;
export const isConfigured = Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);

/** Demo helpers for evaluations (pre-filled demo emails on the sign-in page). */
export const DEMO_MODE = (import.meta.env.VITE_DEMO_MODE ?? 'true') !== 'false';

export const DEMO_ACCOUNTS = [
  { role: 'student', label: 'Student', email: 'student.demo@campussync.test' },
  { role: 'organizer', label: 'Organizer', email: 'organizer.demo@campussync.test' },
  { role: 'dsa', label: 'DSA', email: 'dsa.demo@campussync.test' },
  { role: 'admin', label: 'Admin', email: 'admin.demo@campussync.test' },
] as const;
