// Turns raw Supabase/PostgREST errors into messages a student can act on.
import { isConfigured } from './env';

interface ErrorLike { message?: string; code?: string }

export function friendlyError(error: unknown): string {
  if (!isConfigured) return 'The backend is not connected yet, so CampusSync is showing sample data.';
  const e = (error ?? {}) as ErrorLike;
  const raw = e.message ?? String(error ?? '');
  const msg = raw.toLowerCase();
  if (msg.includes('invalid login credentials')) return 'Email or password is incorrect.';
  if (msg.includes('email not confirmed')) return 'Please confirm your email first. Check your inbox for the link.';
  if (msg.includes('user already registered')) return 'An account with this email already exists. Try signing in instead.';
  if (msg.includes('password should be') || msg.includes('weak password')) return 'That password is too weak. Use at least 8 characters with letters and numbers.';
  if (msg.includes('rate limit') || msg.includes('too many')) return 'Too many attempts. Please wait a minute and try again.';
  if (msg.includes('same password')) return 'The new password must be different from the old one.';
  if (msg.includes('failed to fetch') || msg.includes('network')) return 'Network problem. Check your connection and try again.';
  if (msg.includes('duplicate key') && msg.includes('registration_number')) return 'That registration number is already linked to another account.';
  // Database constraint names → plain language (the DB is the real validator).
  const constraintMessages: Record<string, string> = {
    timetable_slots_no_overlap: 'This class overlaps another class on the same day.',
    timetable_slots_time_order: 'A class must end after it starts.',
    events_time_order: 'The event must end after it starts.',
    events_registration_window: 'Registration must open before it closes, and close before the event starts.',
    events_venue_required: 'Choose a venue before submitting.',
    events_no_venue_double_booking: 'That venue is already booked for an overlapping time.',
    events_capacity_check: 'Capacity must be at least 1.',
    club_members_one_row_per_user: 'That person is already a member of this club.',
  };
  for (const [name, text] of Object.entries(constraintMessages)) if (msg.includes(name)) return text;
  // 42501 "permission denied for table": the database has no GRANT for this
  // table yet (a server setup step), not something the user did wrong.
  if (e.code === '42501' && msg.includes('permission denied for table')) {
    return 'The server is not set up to share this data yet (database permissions missing). Please try again later.';
  }
  if (msg.includes('permission denied') || msg.includes('row-level security')) return 'You do not have permission to do that.';
  return raw || 'Something went wrong. Please try again.';
}
