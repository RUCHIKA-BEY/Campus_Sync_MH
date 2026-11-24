// Authentication state for the whole app (React Context).
//
// The profile (and therefore the ROLE) is read from public.profiles on the
// server. The UI uses it only to decide what to SHOW; every permission is
// enforced again by the database.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, requireSupabase } from '../lib/supabase';
import { friendlyError } from '../lib/errors';
import { PROFILE_COLUMNS, type Profile, type ProfileUpdate } from '../lib/types';

export interface SignUpInput {
  email: string; password: string; fullName: string;
  registrationNumber?: string; departmentCode?: string; academicYear?: string;
}

interface AuthValue {
  ready: boolean;
  session: Session | null;
  profile: Profile | null;
  profileError: string | null;   // signed in but the profile could not load
  recovery: boolean;             // arrived via a password-reset link
  signIn(email: string, password: string): Promise<void>;
  signUp(input: SignUpInput): Promise<{ needsConfirmation: boolean }>;
  signOut(): Promise<void>;
  requestPasswordReset(email: string): Promise<void>;
  updatePassword(password: string): Promise<void>;
  updateProfile(changes: ProfileUpdate): Promise<Profile>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(!supabase);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [recovery, setRecovery] = useState(false);
  const loadedFor = useRef<string | null>(null);

  const loadProfile = useCallback(async (s: Session | null) => {
    if (!supabase || !s) { setProfile(null); setProfileError(null); loadedFor.current = null; return; }
    const { data, error } = await supabase.from('profiles').select(PROFILE_COLUMNS).eq('id', s.user.id).single();
    loadedFor.current = s.user.id;
    if (error) {
      console.error('CampusSync: could not load profile', error);
      setProfile(null);
      setProfileError(friendlyError(error)); // shown in the UI, never swallowed
    } else {
      setProfile(data as Profile);
      setProfileError(null);
    }
  }, []);

  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;
    // Restore the saved session BEFORE the first route decision, so a
    // refresh on /profile doesn't flash the sign-in page.
    supabase.auth.getSession().then(async ({ data }) => {
      if (cancelled) return;
      setSession(data.session);
      await loadProfile(data.session);
      if (!cancelled) setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === 'PASSWORD_RECOVERY') setRecovery(true);
      if (event === 'SIGNED_OUT') setRecovery(false);
      // Don't await Supabase calls inside this callback (it can deadlock the
      // auth lock); defer the profile load to the next tick instead.
      const needsLoad = event === 'SIGNED_OUT' || event === 'USER_UPDATED' || (s && loadedFor.current !== s.user.id);
      if (needsLoad) setTimeout(() => { void loadProfile(s); }, 0);
    });
    return () => { cancelled = true; sub.subscription.unsubscribe(); };
  }, [loadProfile]);

  const value = useMemo<AuthValue>(() => ({
    ready, session, profile, profileError, recovery,
    async signIn(email, password) {
      const { error } = await requireSupabase().auth.signInWithPassword({ email, password });
      if (error) throw error;
    },
    async signUp({ email, password, fullName, registrationNumber, departmentCode, academicYear }) {
      // Metadata is read by the handle_new_user() trigger. A `role` here
      // would be ignored: public sign-up always creates a Student.
      const { data, error } = await requireSupabase().auth.signUp({
        email, password,
        options: {
          emailRedirectTo: `${window.location.origin}/`,
          data: {
            full_name: fullName,
            registration_number: registrationNumber || null,
            department_code: departmentCode || null,
            academic_year: academicYear || null,
          },
        },
      });
      if (error) throw error;
      return { needsConfirmation: !data.session };
    },
    async signOut() {
      const { error } = await requireSupabase().auth.signOut();
      if (error) throw error;
    },
    async requestPasswordReset(email) {
      const { error } = await requireSupabase().auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` });
      if (error) throw error;
    },
    async updatePassword(password) {
      const { error } = await requireSupabase().auth.updateUser({ password });
      if (error) throw error;
      setRecovery(false);
    },
    async updateProfile(changes) {
      if (!session) throw new Error('Not signed in');
      const { data, error } = await requireSupabase().from('profiles')
        .update(changes).eq('id', session.user.id).select(PROFILE_COLUMNS).single();
      if (error) throw error;
      setProfile(data as Profile);
      return data as Profile;
    },
  }), [ready, session, profile, profileError, recovery]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
