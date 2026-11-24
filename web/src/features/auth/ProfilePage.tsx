import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { Check, LogOut, FlaskConical } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider';
import { useToast } from '../../components/Toaster';
import { Badge, Button, Card, Field, FormStatus, Input, Kicker, PageHeader, Select, Skeleton, cx } from '../../components/ui';
import { ROLE_NAV } from '../../components/layout/nav';
import { isConfigured } from '../../lib/env';
import { friendlyError } from '../../lib/errors';
import { useCategories, useDepartments, useMyInterestIds, useToggleInterest } from '../../lib/queries';
import { ROLE_LABELS } from '../../lib/types';
import { PHONE_RE, REGNO_RE, validatePassword } from '../../lib/validation';
import { useFormTask, fail } from './AuthPages';

export function ProfilePage() {
  const { profile, profileError, session, signOut } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  if (!isConfigured) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <PageHeader kicker="Your account" title="Profile" />
        <Card className="flex items-start gap-3 p-6 text-plum-soft">
          <FlaskConical className="mt-0.5 size-5 text-amber" aria-hidden />
          <p>CampusSync is running with sample data, so there are no accounts yet. Connect Supabase to enable sign-in and profiles.</p>
        </Card>
      </div>
    );
  }

  const roleNav = profile ? ROLE_NAV[profile.role] : undefined;
  const onSignOut = async () => {
    try { await signOut(); toast('You have been signed out.'); navigate('/'); }
    catch (e) { toast(friendlyError(e), 'error'); }
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <PageHeader kicker="Your account"
                  title={profile ? `Hi, ${profile.full_name.split(' ')[0]}` : 'Your profile'}
                  actions={profile && <Badge tone="plum" className="px-3 py-1.5 text-xs">{ROLE_LABELS[profile.role]}</Badge>}>
        Keep your details current so organizers and the DSA desk can identify you.
      </PageHeader>

      {!profile && <FormStatus kind="error">{profileError ?? 'Your profile could not be loaded.'}</FormStatus>}

      <div className="mt-2 grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(300px,1fr)]">
        {profile ? <DetailsForm /> : <Card className="p-6"><Skeleton className="h-64" /></Card>}
        <div className="grid content-start gap-6">
          {profile?.role === 'student' && <InterestsCard />}
          <PasswordCard />
          {roleNav && <Link to={roleNav.to} className="rounded-2xl border border-line bg-white p-4 text-sm font-semibold shadow-soft hover:border-terracotta">
            <roleNav.icon className="mr-2 inline size-4 text-terracotta" aria-hidden />Open {roleNav.label}</Link>}
          <Button variant="secondary" onClick={onSignOut}><LogOut className="size-4" />Sign out</Button>
          <p className="text-center text-xs text-plum-muted">Signed in as {session?.user.email}</p>
        </div>
      </div>
    </div>
  );
}

function DetailsForm() {
  const { profile, updateProfile } = useAuth();
  const departments = useDepartments();
  const { busy, error, success, run } = useFormTask();
  const [f, setF] = useState({ full_name: '', registration_number: '', phone_number: '', department_id: '', academic_year: '', semester: '' });
  useEffect(() => {
    if (!profile) return;
    setF({
      full_name: profile.full_name, registration_number: profile.registration_number ?? '', phone_number: profile.phone_number ?? '',
      department_id: profile.department_id ?? '', academic_year: profile.academic_year?.toString() ?? '', semester: profile.semester?.toString() ?? '',
    });
  }, [profile]);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF(p => ({ ...p, [k]: e.target.value }));

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    run(async () => {
      if (f.full_name.trim().length < 2) fail('Enter your full name.');
      if (f.registration_number && !REGNO_RE.test(f.registration_number.trim())) fail('Registration number should be 4–20 letters or digits.');
      if (f.phone_number && !PHONE_RE.test(f.phone_number.trim())) fail('Phone number should contain 7–20 digits.');
      await updateProfile({
        full_name: f.full_name.trim(),
        registration_number: f.registration_number.trim() || null,
        phone_number: f.phone_number.trim() || null,
        department_id: f.department_id || null,
        academic_year: f.academic_year ? Number(f.academic_year) : null,
        semester: f.semester ? Number(f.semester) : null,
      });
      return 'Profile saved.';
    });
  };

  return (
    <Card className="p-6 sm:p-7">
      <Kicker>Personal details</Kicker>
      <form method="post" noValidate onSubmit={onSubmit} className="mt-4 grid gap-4">
        <Field label="Full name"><Input value={f.full_name} onChange={set('full_name')} maxLength={100} autoComplete="name" /></Field>
        <Field label="Email" hint="Your sign-in email can’t be changed here."><Input value={profile?.email ?? ''} readOnly /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Registration number"><Input value={f.registration_number} onChange={set('registration_number')} maxLength={20} /></Field>
          <Field label="Phone (private)"><Input type="tel" value={f.phone_number} onChange={set('phone_number')} autoComplete="tel" maxLength={20} /></Field>
        </div>
        <Field label="Department" hint={departments.isError ? friendlyError(departments.error) : undefined}>
          <Select value={f.department_id} onChange={set('department_id')} disabled={!departments.data}>
            <option value="">{departments.isError ? 'Couldn’t load departments' : 'Not set'}</option>
            {departments.data?.map(d => <option key={d.id} value={d.id}>{d.name} ({d.code})</option>)}
          </Select>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Academic year">
            <Select value={f.academic_year} onChange={set('academic_year')}>
              <option value="">Not set</option>{[1, 2, 3, 4, 5].map(y => <option key={y} value={y}>Year {y}</option>)}
            </Select>
          </Field>
          <Field label="Semester">
            <Select value={f.semester} onChange={set('semester')}>
              <option value="">Not set</option>{Array.from({ length: 10 }, (_, i) => <option key={i + 1} value={i + 1}>Semester {i + 1}</option>)}
            </Select>
          </Field>
        </div>
        <FormStatus kind="error">{error}</FormStatus>
        <FormStatus kind="success">{success}</FormStatus>
        <Button type="submit" loading={busy} loadingLabel="Saving…" className="justify-self-start">Save changes</Button>
      </form>
    </Card>
  );
}

function InterestsCard() {
  const categories = useCategories();
  const mine = useMyInterestIds();
  const toggle = useToggleInterest();
  const toast = useToast();
  return (
    <Card className="p-6">
      <Kicker>For you</Kicker>
      <h3 className="mt-1 text-lg">Your interests</h3>
      <p className="mt-1 text-sm text-plum-soft">Pick the kinds of events you want to see first on Discover.</p>
      {categories.isError || mine.isError ? (
        <div className="mt-3"><FormStatus kind="error">{friendlyError(categories.error ?? mine.error)}</FormStatus></div>
      ) : !categories.data || !mine.data ? (
        <div className="mt-4 flex flex-wrap gap-2">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-8 w-24 rounded-full" />)}</div>
      ) : (
        <div className="mt-4 flex flex-wrap gap-2">
          {categories.data.map(c => {
            const on = mine.data.has(c.id);
            return (
              <button key={c.id} type="button" aria-pressed={on} disabled={toggle.isPending}
                      onClick={() => toggle.mutate({ categoryId: c.id, selected: !on }, { onError: e => toast(friendlyError(e), 'error') })}
                      className={cx('inline-flex items-center gap-1 rounded-full border px-3.5 py-1.5 text-sm font-semibold transition disabled:opacity-60',
                        on ? 'border-terracotta bg-terracotta text-white' : 'border-mauve-strong bg-mauve text-plum hover:border-terracotta')}>
                {on && <Check className="size-3.5" aria-hidden />}{c.name}
              </button>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function PasswordCard() {
  const { updatePassword } = useAuth();
  const { busy, error, success, run } = useFormTask();
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  return (
    <Card className="p-6">
      <Kicker>Security</Kicker>
      <h3 className="mt-1 text-lg">Change password</h3>
      <form method="post" noValidate className="mt-4 grid gap-3" onSubmit={e => {
        e.preventDefault();
        run(async () => {
          const v = validatePassword(pw, confirm);
          if (v) fail(v);
          await updatePassword(pw);
          setPw(''); setConfirm('');
          return 'Password updated.';
        });
      }}>
        <Field label="New password"><Input type="password" autoComplete="new-password" value={pw} onChange={e => setPw(e.target.value)} /></Field>
        <Field label="Confirm new password"><Input type="password" autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)} /></Field>
        <FormStatus kind="error">{error}</FormStatus>
        <FormStatus kind="success">{success}</FormStatus>
        <Button type="submit" variant="secondary" loading={busy} loadingLabel="Updating…">Update password</Button>
      </form>
    </Card>
  );
}
