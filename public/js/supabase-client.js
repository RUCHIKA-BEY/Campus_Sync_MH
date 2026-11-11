// Creates the ONE Supabase client the whole app shares.
// The library is loaded as an ES module from a pinned CDN version, so
// the site still needs no build step. Pinning an exact version means a
// new library release can never silently change the app's behaviour.
// It is imported only when keys are configured, so sample-data mode
// (and an offline classroom demo) never depends on the CDN.
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';

const SUPABASE_JS_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0/+esm';

export const isConfigured = Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);
export let clientLoadError = null;

async function createSupabase() {
  if (!isConfigured) return null;
  try {
    const { createClient } = await import(SUPABASE_JS_URL);
    return createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: {
        persistSession: true,     // keep the session in localStorage across reloads
        autoRefreshToken: true,   // renew the short-lived access token automatically
        detectSessionInUrl: true, // read the session from confirmation / reset links
        // 'implicit' returns tokens in the URL hash, which works even when
        // the email link is opened in a different browser (PKCE would not).
        flowType: 'implicit',
      },
    });
  } catch (err) {
    clientLoadError = err;
    console.error('CampusSync: could not load the Supabase library.', err);
    return null;
  }
}

export const supabase = await createSupabase();
