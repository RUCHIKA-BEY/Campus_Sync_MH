// Authentication logic (no DOM code here; see auth-ui.js for screens).
//
// Key idea: the frontend uses the session and profile ONLY to decide
// what to SHOW. Every permission is enforced again by the database (RLS),
// so editing this file or localStorage cannot grant real access.
import { supabase, isConfigured } from './supabase-client.js';

export { isConfigured };

// Current auth state, shared by the whole app.
export const authState = {
  ready: false,      // true once the stored session has been checked
  session: null,     // Supabase session (contains the JWT access token)
  profile: null,     // row from public.profiles (role comes from HERE, not from the browser)
  recovery: false,   // true after clicking a password-reset email link
};

const listeners = new Set();
export function onAuthChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit(event) { listeners.forEach(fn => { try { fn(authState, event); } catch (e) { console.error(e); } }); }

export const ROLE_LABELS = { student: 'Student', organizer: 'Organizer', dsa: 'DSA', admin: 'Admin' };
export const isSignedIn = () => Boolean(authState.session);
export const currentRole = () => authState.profile?.role ?? null;

// ---------------------------------------------------------------------
// Error messages a student can act on (raw Supabase errors are cryptic)
// ---------------------------------------------------------------------
export function friendlyError(error) {
  const msg = (error?.message || String(error || '')).toLowerCase();
  if (!isConfigured) return 'The backend is not connected yet. Add your Supabase keys to public/js/config.js.';
  if (msg.includes('invalid login credentials')) return 'Email or password is incorrect.';
  if (msg.includes('email not confirmed')) return 'Please confirm your email first. Check your inbox for the link.';
  if (msg.includes('user already registered')) return 'An account with this email already exists. Try signing in instead.';
  if (msg.includes('password should be') || msg.includes('weak password')) return 'That password is too weak. Use at least 8 characters with letters and numbers.';
  if (msg.includes('rate limit') || msg.includes('too many')) return 'Too many attempts. Please wait a minute and try again.';
  if (msg.includes('same password')) return 'The new password must be different from the old one.';
  if (msg.includes('failed to fetch') || msg.includes('network')) return 'Network problem. Check your connection and try again.';
  if (msg.includes('duplicate key') && msg.includes('registration_number')) return 'That registration number is already linked to another account.';
  if (msg.includes('permission denied') || msg.includes('row-level security')) return 'You do not have permission to do that.';
  return error?.message || 'Something went wrong. Please try again.';
}

function requireClient() {
  if (!supabase) throw new Error('Backend not configured');
}

// ---------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------
export async function loadProfile() {
  if (!supabase || !authState.session) { authState.profile = null; return null; }
  const { data, error } = await supabase
    .from('profiles')
    .select('id, role, full_name, email, registration_number, department_id, academic_year, semester, phone_number, is_active')
    .eq('id', authState.session.user.id)
    .single();
  if (error) {
    console.error('CampusSync: could not load profile', error);
    authState.profile = null;
    return null;
  }
  authState.profile = data;
  return data;
}

// Only the columns the database lets a user change (see migration 5).
const EDITABLE_PROFILE_FIELDS = ['full_name', 'registration_number', 'department_id', 'academic_year', 'semester', 'phone_number'];
export async function updateProfile(changes) {
  requireClient();
  const clean = Object.fromEntries(Object.entries(changes).filter(([k]) => EDITABLE_PROFILE_FIELDS.includes(k)));
  const { data, error } = await supabase.from('profiles')
    .update(clean).eq('id', authState.session.user.id)
    .select('id, role, full_name, email, registration_number, department_id, academic_year, semester, phone_number, is_active')
    .single();
  if (error) throw error;
  authState.profile = data;
  emit('PROFILE_UPDATED');
  return data;
}

// ---------------------------------------------------------------------
// Sign up / in / out, password reset
// ---------------------------------------------------------------------
// Everything in `data` is stored as user metadata and read by the
// database trigger handle_new_user(). A `role` here would be ignored:
// public signup always creates a Student.
export async function signUp({ email, password, fullName, registrationNumber, departmentCode, academicYear }) {
  requireClient();
  const { data, error } = await supabase.auth.signUp({
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
  // With "Confirm email" enabled (the default), there is no session until
  // the user clicks the link in their inbox.
  return { needsConfirmation: !data.session };
}

export async function signIn({ email, password }) {
  requireClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function signOut() {
  requireClient();
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function requestPasswordReset(email) {
  requireClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/`,
  });
  if (error) throw error;
}

export async function updatePassword(newPassword) {
  requireClient();
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
  authState.recovery = false;
}

export async function listDepartments() {
  if (!supabase) return [];
  const { data, error } = await supabase.from('departments').select('id, code, name').order('name');
  if (error) { console.error(error); return []; }
  return data;
}

// Student interests (table student_interests; RLS: own rows only).
export async function listCategories() {
  if (!supabase) return [];
  const { data, error } = await supabase.from('categories').select('id, name, slug').order('sort_order');
  if (error) { console.error(error); return []; }
  return data;
}

export async function loadMyInterestIds() {
  if (!supabase || !authState.session) return new Set();
  const { data, error } = await supabase.from('student_interests').select('category_id');
  if (error) throw error;
  return new Set(data.map(r => r.category_id));
}

export async function setInterest(categoryId, selected) {
  requireClient();
  const studentId = authState.session.user.id;
  const { error } = selected
    ? await supabase.from('student_interests').insert({ student_id: studentId, category_id: categoryId })
    : await supabase.from('student_interests').delete().eq('student_id', studentId).eq('category_id', categoryId);
  if (error && error.code !== '23505') throw error; // 23505 = already selected: fine
}

// ---------------------------------------------------------------------
// Start-up: restore the session saved in localStorage, then keep
// listening for sign-in, sign-out, token refresh and password recovery.
// ---------------------------------------------------------------------
export async function initAuth() {
  if (!supabase) { authState.ready = true; emit('INITIAL'); return authState; }

  // onAuthStateChange fires INITIAL_SESSION, SIGNED_IN, SIGNED_OUT,
  // TOKEN_REFRESHED, USER_UPDATED and PASSWORD_RECOVERY. The callback
  // must not await Supabase calls directly (that can deadlock the auth
  // lock), so the profile load is deferred with setTimeout.
  supabase.auth.onAuthStateChange((event, session) => {
    authState.session = session;
    if (event === 'PASSWORD_RECOVERY') authState.recovery = true;
    if (event === 'SIGNED_OUT') { authState.profile = null; authState.recovery = false; }
    if (event === 'INITIAL_SESSION') return; // handled below
    setTimeout(async () => {
      if (session && (event === 'SIGNED_IN' || event === 'USER_UPDATED' || !authState.profile)) await loadProfile();
      emit(event);
    }, 0);
  });

  const { data } = await supabase.auth.getSession();
  authState.session = data.session;
  if (data.session) await loadProfile();
  authState.ready = true;
  emit('INITIAL');
  return authState;
}
