// CampusSync public configuration
// ---------------------------------------------------------------------
// These two values are PUBLIC by design: every visitor's browser
// downloads this file. A publishable key only lets the browser talk to
// your project AS the visitor; what it may read or change is decided by
// Row Level Security in the database, not by keeping this key secret.
//
// NEVER put the secret / service-role key or the database password here.
//
// Where to find them: Supabase dashboard → Project Settings → API Keys
// (publishable key) and Project Settings → Data API (project URL).
// Leave them empty to run the UI in sample-data mode.
export const SUPABASE_URL = '';
export const SUPABASE_PUBLISHABLE_KEY = '';

// Demo helpers for evaluations. When true, the "Evaluation Mode" bar
// pre-fills the email of a demo account for each role. Passwords are
// never stored in frontend code; the presenter types it. Set to false
// for a real deployment.
export const DEMO_MODE = true;
export const DEMO_ACCOUNTS = {
  STUDENT:   'student.demo@campussync.test',
  ORGANIZER: 'organizer.demo@campussync.test',
  DSA:       'dsa.demo@campussync.test',
  ADMIN:     'admin.demo@campussync.test',
};
