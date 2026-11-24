// Which pages each visitor may SEE. This is user experience only: the
// database (GRANTs + RLS) refuses unauthorised reads and writes even if
// someone bypasses this file entirely.
import type { AppRole } from './types';

export type Access =
  | { kind: 'public' }
  | { kind: 'signed-in' }
  | { kind: 'role'; roles: AppRole[] };

export const HOME_BY_ROLE: Record<AppRole, string> = {
  student: '/',
  organizer: '/organizer',
  dsa: '/dsa',
  admin: '/admin',
};

export type AccessDecision =
  | { allow: true }
  | { allow: false; redirect: string; reason: 'sign-in' | 'role' };

/**
 * @param configured whether a backend is connected (sample mode allows all)
 * @param signedIn   whether there is a session
 * @param role       role from public.profiles (never from the browser)
 */
export function decideAccess(access: Access, configured: boolean, signedIn: boolean, role: AppRole | null): AccessDecision {
  if (!configured || access.kind === 'public') return { allow: true };
  if (!signedIn) return { allow: false, redirect: '/login', reason: 'sign-in' };
  if (access.kind === 'role' && (!role || !access.roles.includes(role))) {
    return { allow: false, redirect: role ? HOME_BY_ROLE[role] : '/discover', reason: 'role' };
  }
  return { allow: true };
}
