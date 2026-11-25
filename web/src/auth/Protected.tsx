// Route guard: decides what to SHOW. Real protection is in the database.
import { useEffect, useRef, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { useAuth } from './AuthProvider';
import { decideAccess, type Access } from '../lib/access';
import { isConfigured } from '../lib/env';
import { useToast } from '../components/Toaster';
import { BrandLoader } from '../components/brand/Brand';

export function Protected({ access, children }: { access: Access; children: ReactNode }) {
  const { ready, session, profile } = useAuth();
  const location = useLocation();
  const toast = useToast();
  const decision = ready ? decideAccess(access, isConfigured, Boolean(session), profile?.role ?? null) : null;
  const told = useRef(false);

  useEffect(() => {
    if (decision && !decision.allow && !told.current) {
      told.current = true;
      toast(decision.reason === 'sign-in' ? 'Please sign in to continue.' : 'That area is only available to authorised staff.', 'info');
    }
  }, [decision, toast]);

  if (!decision) {
    return <BrandLoader label="Loading" className="min-h-[50vh]" />;
  }
  if (!decision.allow) return <Navigate to={decision.redirect} replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}
