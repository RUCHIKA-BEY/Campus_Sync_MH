// The ONE Supabase client the whole app shares (null in sample-data mode).
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, isConfigured } from './env';

export const supabase: SupabaseClient | null = isConfigured
  ? createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: {
        persistSession: true,     // keep the session in localStorage across reloads
        autoRefreshToken: true,   // renew the short-lived access token automatically
        detectSessionInUrl: true, // read the session from confirmation / reset links
        // 'implicit' puts tokens in the URL hash, so an email link also works
        // when opened in a different browser (PKCE would not). With real
        // routes (/discover) the hash is free for this.
        flowType: 'implicit',
      },
    })
  : null;

export function requireSupabase(): SupabaseClient {
  if (!supabase) throw new Error('Backend not configured');
  return supabase;
}
