import { describe, expect, it } from 'vitest';
import { decideAccess } from './access';
import { looksLikeSecretKey } from './env';

describe('decideAccess (UI route guard; the database enforces real access)', () => {
  it('sample mode (no backend) allows everything', () =>
    expect(decideAccess({ kind: 'role', roles: ['admin'] }, false, false, null)).toEqual({ allow: true }));
  it('public pages are always allowed', () =>
    expect(decideAccess({ kind: 'public' }, true, false, null)).toEqual({ allow: true }));
  it('signed-in pages send visitors to /login', () =>
    expect(decideAccess({ kind: 'signed-in' }, true, false, null)).toEqual({ allow: false, redirect: '/login', reason: 'sign-in' }));
  it('a student cannot open the admin console and is sent home', () =>
    expect(decideAccess({ kind: 'role', roles: ['admin'] }, true, true, 'student')).toEqual({ allow: false, redirect: '/', reason: 'role' }));
  it('an organizer opening the DSA desk goes to their own console', () =>
    expect(decideAccess({ kind: 'role', roles: ['dsa'] }, true, true, 'organizer')).toMatchObject({ redirect: '/organizer' }));
  it('signed in but profile unavailable gets no role pages', () =>
    expect(decideAccess({ kind: 'role', roles: ['organizer'] }, true, true, null)).toMatchObject({ allow: false }));
  it('matching role is allowed', () =>
    expect(decideAccess({ kind: 'role', roles: ['dsa'] }, true, true, 'dsa')).toEqual({ allow: true }));
});

describe('looksLikeSecretKey (refuse secret keys in browser config)', () => {
  it('flags sb_secret_ keys', () => expect(looksLikeSecretKey('sb_secret_abc')).toBe(true));
  it('accepts publishable keys', () => expect(looksLikeSecretKey('sb_publishable_abc')).toBe(false));
  it('flags legacy service_role JWTs', () => {
    const payload = btoa(JSON.stringify({ role: 'service_role' })).replace(/=+$/, '');
    expect(looksLikeSecretKey(`eyJhbGciOiJIUzI1NiJ9.${payload}.sig`)).toBe(true);
  });
  it('accepts legacy anon JWTs', () => {
    const payload = btoa(JSON.stringify({ role: 'anon' })).replace(/=+$/, '');
    expect(looksLikeSecretKey(`eyJhbGciOiJIUzI1NiJ9.${payload}.sig`)).toBe(false);
  });
});
