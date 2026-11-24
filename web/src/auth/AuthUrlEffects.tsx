// Reacts to Supabase email links (confirmation, password reset, errors).
import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from './AuthProvider';
import { useToast } from '../components/Toaster';

export function AuthUrlEffects() {
  const { recovery, ready, session, profileError } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const handled = useRef(false);

  // "#error=…&error_description=Email+link+is+invalid+or+has+expired"
  useEffect(() => {
    if (handled.current) return;
    handled.current = true;
    const hash = window.location.hash.slice(1);
    if (!hash.includes('error_description=')) return;
    const message = new URLSearchParams(hash).get('error_description');
    history.replaceState(null, '', window.location.pathname + window.location.search);
    if (message) { toast(message, 'error'); navigate('/login'); }
  }, [navigate, toast]);

  // Clicking a reset link fires PASSWORD_RECOVERY → show the new-password form.
  useEffect(() => { if (recovery) navigate('/reset-password'); }, [recovery, navigate]);

  // Signed in, but the profile row can't be read: say so once, clearly.
  const warned = useRef<string | null>(null);
  useEffect(() => {
    if (ready && session && profileError && warned.current !== session.user.id) {
      warned.current = session.user.id;
      toast(`Signed in, but your profile couldn’t be loaded: ${profileError}`, 'error');
    }
  }, [ready, session, profileError, toast]);

  return null;
}
