import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { motion } from 'motion/react';
import { Sparkles, ShieldCheck, CalendarCheck2, Mail } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider';
import { useToast } from '../../components/Toaster';
import { Button, Card, Field, FormStatus, Input, Kicker, Select } from '../../components/ui';
import { DEMO_ACCOUNTS, DEMO_MODE, isConfigured } from '../../lib/env';
import { friendlyError } from '../../lib/errors';
import { useDepartments } from '../../lib/queries';
import { EMAIL_RE, REGNO_RE, validatePassword } from '../../lib/validation';
import { HOME_BY_ROLE } from '../../lib/access';

// Runs a form task with a busy flag (blocks double submits) and a message.
function useFormTask() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  async function run(task: () => Promise<string | void>) {
    if (busy) return;
    setBusy(true); setError(null); setSuccess(null);
    try {
      const msg = await task();
      if (msg) setSuccess(msg);
    } catch (e) {
      setError(e instanceof ValidationError ? e.message : friendlyError(e));
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, success, run, setError };
}
class ValidationError extends Error {}
const fail = (msg: string): never => { throw new ValidationError(msg); };

function NotConnectedNote() {
  if (isConfigured) return null;
  return (
    <p className="rounded-xl border border-line bg-amber-bg px-4 py-3 text-sm text-plum">
      Accounts aren’t connected in this build. Add <code className="font-semibold">VITE_SUPABASE_URL</code> and{' '}
      <code className="font-semibold">VITE_SUPABASE_PUBLISHABLE_KEY</code> to <code>.env.local</code>. Meanwhile CampusSync shows sample data.
    </p>
  );
}

function AuthLayout({ kicker, title, lead, children, wide }: { kicker: string; title: string; lead: ReactNode; children: ReactNode; wide?: boolean }) {
  return (
    <div className="ambient">
      <div className="mx-auto grid max-w-6xl items-start gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[1fr_minmax(0,auto)] lg:py-16">
        <motion.aside initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} className="hidden max-w-md pt-6 lg:block">
          <h2 className="text-4xl leading-tight font-extrabold">Every campus moment, <span className="text-terracotta">in sync</span> with your week.</h2>
          <ul className="mt-8 grid gap-4 text-plum-soft">
            {[
              [CalendarCheck2, 'See whether an event clashes with your classes before you commit.'],
              [Sparkles, 'Follow clubs and pick interests to surface events made for you.'],
              [ShieldCheck, 'Your timetable stays private. Only you can see it.'],
            ].map(([Icon, text], i) => {
              const I = Icon as typeof Sparkles;
              return (
                <li key={i} className="flex gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-white text-terracotta shadow-soft"><I className="size-5" aria-hidden /></span>
                  <span className="pt-1.5">{text as string}</span>
                </li>
              );
            })}
          </ul>
        </motion.aside>
        <Card className={wide ? 'w-full p-6 sm:p-8 lg:w-[600px]' : 'w-full p-6 sm:p-8 lg:w-[460px]'}>
          <Kicker>{kicker}</Kicker>
          <h1 className="mt-2 text-[2rem] leading-tight font-extrabold">{title}</h1>
          <div className="mt-2 text-sm text-plum-soft">{lead}</div>
          <div className="mt-6 grid gap-4">{children}</div>
        </Card>
      </div>
    </div>
  );
}

// ================================================================= Login
export function LoginPage() {
  const { signIn, session, profile, profileError, ready } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const from = (location.state as { from?: string } | null)?.from;
  const { busy, error, success, run } = useFormTask();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const passwordRef = useRef<HTMLInputElement>(null);
  const [demoNote, setDemoNote] = useState<string | null>(null);

  // Once signed in AND the profile attempt finished, go where the user wanted.
  useEffect(() => {
    if (!ready || !session || (!profile && !profileError)) return;
    if (profile) toast(`Signed in as ${profile.full_name}.`, 'success');
    navigate(from ?? (profile ? HOME_BY_ROLE[profile.role] : '/discover'), { replace: true });
  }, [ready, session, profile, profileError, from, navigate, toast]);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    run(async () => {
      if (!isConfigured) fail(friendlyError(null));
      if (!EMAIL_RE.test(email.trim())) fail('Enter a valid email address.');
      if (!password) fail('Enter your password.');
      await signIn(email.trim(), password);
      setPassword('');
    });
  };

  return (
    <AuthLayout kicker="Welcome back" title="Sign in" lead="Use your university email to continue.">
      <NotConnectedNote />
      {/* method="post": if JS ever fails, credentials never end up in the URL */}
      <form method="post" noValidate onSubmit={onSubmit} className="grid gap-4">
        <Field label="University email"><Input type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} required /></Field>
        <Field label="Password"><Input ref={passwordRef} type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required /></Field>
        <FormStatus kind="error">{error}</FormStatus>
        <FormStatus kind="success">{success ?? demoNote}</FormStatus>
        <Button type="submit" size="lg" loading={busy} loadingLabel="Signing in…">Sign in</Button>
      </form>
      {DEMO_MODE && isConfigured && (
        <div className="rounded-2xl border border-dashed border-mauve-strong bg-cream/70 p-4">
          <p className="text-xs font-bold tracking-wide text-plum-soft uppercase">Evaluation demo accounts</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {DEMO_ACCOUNTS.map(a => (
              <button key={a.role} type="button" onClick={() => { setEmail(a.email); setPassword(''); setDemoNote(`Demo ${a.label.toLowerCase()} selected. Type the demo password.`); passwordRef.current?.focus(); }}
                      className="rounded-full border border-line bg-white px-3 py-1.5 text-xs font-bold text-plum transition hover:border-terracotta hover:text-terracotta-deep">
                {a.label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-plum-muted">Fills in the email only. Passwords are never stored in the website’s code.</p>
        </div>
      )}
      <div className="flex flex-wrap justify-between gap-2 border-t border-line pt-4 text-sm">
        <Link to="/forgot-password" className="font-semibold text-terracotta-deep hover:underline">Forgot password?</Link>
        <span className="text-plum-soft">New here? <Link to="/signup" className="font-semibold text-terracotta-deep hover:underline">Create a student account</Link></span>
      </div>
    </AuthLayout>
  );
}

// ================================================================ Signup
export function SignupPage() {
  const { signUp } = useAuth();
  const departments = useDepartments();
  const { busy, error, success, run } = useFormTask();
  const [f, setF] = useState({ fullName: '', email: '', registrationNumber: '', academicYear: '', departmentCode: '', password: '', confirm: '' });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF(prev => ({ ...prev, [k]: e.target.value }));

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    run(async () => {
      if (!isConfigured) fail(friendlyError(null));
      if (f.fullName.trim().length < 2) fail('Enter your full name.');
      if (!EMAIL_RE.test(f.email.trim())) fail('Enter a valid university email address.');
      if (f.registrationNumber && !REGNO_RE.test(f.registrationNumber.trim())) fail('Registration number should be 4–20 letters or digits.');
      const pw = validatePassword(f.password, f.confirm);
      if (pw) fail(pw);
      const { needsConfirmation } = await signUp({
        email: f.email.trim(), password: f.password, fullName: f.fullName.trim(),
        registrationNumber: f.registrationNumber.trim(), departmentCode: f.departmentCode, academicYear: f.academicYear,
      });
      setF({ fullName: '', email: '', registrationNumber: '', academicYear: '', departmentCode: '', password: '', confirm: '' });
      return needsConfirmation
        ? 'Account created! Check your inbox and click the confirmation link, then sign in.'
        : 'Account created. You are signed in.';
    });
  };

  const deptPlaceholder = departments.isPending && isConfigured ? 'Loading departments…'
    : departments.isError ? 'Couldn’t load departments (you can set this later)'
    : 'Select your department';

  return (
    <AuthLayout wide kicker="Join your campus" title="Create your account"
                lead={<>Public sign-up always creates a <strong className="text-plum">Student</strong> account. Organizer, DSA and Admin access is granted by an administrator.</>}>
      <NotConnectedNote />
      <form method="post" noValidate onSubmit={onSubmit} className="grid gap-4">
        <Field label="Full name"><Input autoComplete="name" value={f.fullName} onChange={set('fullName')} maxLength={100} required /></Field>
        <Field label="University email"><Input type="email" autoComplete="email" value={f.email} onChange={set('email')} required /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Registration number"><Input placeholder="e.g. 22CS1042" value={f.registrationNumber} onChange={set('registrationNumber')} maxLength={20} /></Field>
          <Field label="Academic year">
            <Select value={f.academicYear} onChange={set('academicYear')}>
              <option value="">Select</option>
              {[1, 2, 3, 4, 5].map(y => <option key={y} value={y}>Year {y}</option>)}
            </Select>
          </Field>
        </div>
        <Field label="Department" hint={departments.isError ? friendlyError(departments.error) : undefined}>
          <Select value={f.departmentCode} onChange={set('departmentCode')} disabled={!departments.data}>
            <option value="">{deptPlaceholder}</option>
            {departments.data?.map(d => <option key={d.id} value={d.code}>{d.name} ({d.code})</option>)}
          </Select>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Password"><Input type="password" autoComplete="new-password" value={f.password} onChange={set('password')} required /></Field>
          <Field label="Confirm password"><Input type="password" autoComplete="new-password" value={f.confirm} onChange={set('confirm')} required /></Field>
        </div>
        <p className="-mt-1 text-xs text-plum-muted">At least 8 characters, including a letter and a number.</p>
        <FormStatus kind="error">{error}</FormStatus>
        <FormStatus kind="success">{success}</FormStatus>
        <Button type="submit" size="lg" loading={busy} loadingLabel="Creating account…">Create account</Button>
      </form>
      <p className="border-t border-line pt-4 text-sm text-plum-soft">Already registered? <Link to="/login" className="font-semibold text-terracotta-deep hover:underline">Sign in</Link></p>
    </AuthLayout>
  );
}

// ======================================================= Forgot password
export function ForgotPasswordPage() {
  const { requestPasswordReset } = useAuth();
  const { busy, error, success, run } = useFormTask();
  const [email, setEmail] = useState('');
  return (
    <AuthLayout kicker="Account recovery" title="Reset your password" lead="We’ll email you a link to choose a new password.">
      <NotConnectedNote />
      <form method="post" noValidate className="grid gap-4" onSubmit={e => {
        e.preventDefault();
        run(async () => {
          if (!isConfigured) fail(friendlyError(null));
          if (!EMAIL_RE.test(email.trim())) fail('Enter a valid email address.');
          await requestPasswordReset(email.trim());
          // Same message either way, so the form can't reveal who has an account.
          return 'If an account exists for that email, a reset link is on its way.';
        });
      }}>
        <Field label="University email"><Input type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} required /></Field>
        <FormStatus kind="error">{error}</FormStatus>
        <FormStatus kind="success">{success}</FormStatus>
        <Button type="submit" size="lg" loading={busy} loadingLabel="Sending link…"><Mail className="size-4" />Send reset link</Button>
      </form>
      <Link to="/login" className="border-t border-line pt-4 text-sm font-semibold text-terracotta-deep hover:underline">← Back to sign in</Link>
    </AuthLayout>
  );
}

// ======================================================== Reset password
export function ResetPasswordPage() {
  const { updatePassword, recovery, session, ready } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const { busy, error, run } = useFormTask();
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');

  if (ready && !recovery && !session) {
    return (
      <AuthLayout kicker="Account recovery" title="Link needed" lead="Open the reset link from your email to choose a new password.">
        <Link to="/forgot-password" className="font-semibold text-terracotta-deep hover:underline">Request a new link</Link>
      </AuthLayout>
    );
  }
  return (
    <AuthLayout kicker="Account recovery" title="Choose a new password" lead="Pick a new password to finish.">
      <form method="post" noValidate className="grid gap-4" onSubmit={e => {
        e.preventDefault();
        run(async () => {
          const v = validatePassword(pw, confirm);
          if (v) fail(v);
          await updatePassword(pw);
          toast('Password updated. You are signed in.', 'success');
          navigate('/discover');
        });
      }}>
        <Field label="New password"><Input type="password" autoComplete="new-password" value={pw} onChange={e => setPw(e.target.value)} /></Field>
        <Field label="Confirm new password"><Input type="password" autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)} /></Field>
        <FormStatus kind="error">{error}</FormStatus>
        <Button type="submit" size="lg" loading={busy} loadingLabel="Saving…">Save new password</Button>
      </form>
    </AuthLayout>
  );
}

export { useFormTask, ValidationError, fail };
