// CampusSync public configuration
// ---------------------------------------------------------------------
// These two values are PUBLIC by design: every visitor's browser
// downloads this file. A publishable key only lets the browser talk to
// your project AS the visitor; what it may read or change is decided by
// Row Level Security in the database, not by keeping this key secret.
//
// NEVER put the secret / service-role key or the database password here.
//
// Where to find them: Supabase dashboard → the "Connect" button at the
// top of your project shows the project URL and the publishable key.
// All keys are also listed under Settings → API Keys.
// Leave them empty to run the UI in sample-data mode.
export const SUPABASE_URL = 'https://zmnhoeytxufogxquixpt.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_ltmQUx9f3dg0KiU29zB94w_EF2iuzh9';

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
