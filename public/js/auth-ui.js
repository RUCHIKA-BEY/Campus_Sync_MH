// Authentication screens and route protection.
//
// Route guarding here is about USER EXPERIENCE (sending you to the
// sign-in page instead of an empty dashboard). It is NOT security: the
// database's RLS policies refuse unauthorized reads and writes even if
// someone bypasses this file entirely.
import { DEMO_MODE, DEMO_ACCOUNTS } from './config.js';
import {
  authState, onAuthChange, isConfigured, isSignedIn, currentRole, ROLE_LABELS,
  friendlyError, signIn, signUp, signOut, requestPasswordReset, updatePassword,
  updateProfile, listDepartments, listCategories, loadMyInterestIds, setInterest,
} from './auth.js';
import { clientLoadError } from './supabase-client.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

// ---------------------------------------------------------------------
// Route rules
// ---------------------------------------------------------------------
const AUTH_PAGES = new Set(['login', 'signup', 'forgot-password', 'reset-password']);
const SIGNED_IN_PAGES = new Set(['timetable', 'registrations', 'profile']);
const ROLE_PAGES = { organizer: ['organizer'], dsa: ['dsa'], admin: ['admin'] };
const HOME_BY_ROLE = { student: 'landing', organizer: 'organizer', dsa: 'dsa', admin: 'admin' };

let navigateFn = page => { window.location.hash = page; };
let pendingPage = null; // page the user wanted before being sent to sign in

export const homePage = () => HOME_BY_ROLE[currentRole()] ?? 'landing';

/** Decide which page to actually show. Returns the page name. */
export function guardRoute(page) {
  if (!isConfigured) {
    // Sample-data mode keeps the original demo behaviour.
    return page === 'profile' ? 'login' : page;
  }
  if (!authState.ready) return page;
  const signedIn = isSignedIn();

  if (page === 'reset-password' && !authState.recovery) return signedIn ? 'profile' : 'login';
  if (AUTH_PAGES.has(page) && page !== 'reset-password' && signedIn) return homePage();

  const needsRole = ROLE_PAGES[page];
  if ((SIGNED_IN_PAGES.has(page) || needsRole) && !signedIn) {
    pendingPage = page;
    showToast('Please sign in to continue.');
    return 'login';
  }
  if (needsRole && !needsRole.includes(currentRole())) {
    showToast('That area is only available to authorised staff.');
    return homePage();
  }
  return page;
}

// ---------------------------------------------------------------------
// Small UI helpers
// ---------------------------------------------------------------------
let toastTimer;
export function showToast(message) {
  const el = $('#app-toast');
  if (!el) return;
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 4200);
}

function setStatus(form, message, kind = 'error') {
  const el = $('.form-status', form) || form.querySelector('[data-interests-status]');
  if (!el) return;
  el.textContent = message;
  el.classList.toggle('is-error', kind === 'error' && Boolean(message));
  el.classList.toggle('is-success', kind === 'success');
}

// Prevents double submission and shows a busy label while waiting.
async function withBusy(form, task) {
  if (form.dataset.busy) return;
  const button = form.querySelector('[type="submit"]');
  const label = button.textContent;
  form.dataset.busy = 'true';
  form.setAttribute('aria-busy', 'true');
  button.disabled = true;
  button.textContent = button.dataset.busyLabel || 'Please wait…';
  setStatus(form, '');
  try {
    await task();
  } catch (err) {
    console.error(err);
    setStatus(form, friendlyError(err), 'error');
  } finally {
    delete form.dataset.busy;
    form.removeAttribute('aria-busy');
    button.disabled = false;
    button.textContent = label;
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const REGNO_RE = /^[A-Za-z0-9]{4,20}$/;
function validatePassword(password, confirm) {
  if (password.length < 8) return 'Password must be at least 8 characters.';
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) return 'Password must include a letter and a number.';
  if (confirm !== undefined && password !== confirm) return 'The two passwords do not match.';
  return null;
}
class ValidationError extends Error {}
const fail = msg => { throw new ValidationError(msg); };
const fieldsOf = form => Object.fromEntries(new FormData(form).entries());

// ---------------------------------------------------------------------
// Form handlers
// ---------------------------------------------------------------------
const handlers = {
  async login(form) {
    const { email, password } = fieldsOf(form);
    if (!EMAIL_RE.test(email.trim())) fail('Enter a valid email address.');
    if (!password) fail('Enter your password.');
    await signIn({ email: email.trim(), password });
    form.reset();
    // Navigation happens in the SIGNED_IN listener once the profile loads.
  },

  async signup(form) {
    const f = fieldsOf(form);
    if (f.fullName.trim().length < 2) fail('Enter your full name.');
    if (!EMAIL_RE.test(f.email.trim())) fail('Enter a valid university email address.');
    if (f.registrationNumber && !REGNO_RE.test(f.registrationNumber.trim())) fail('Registration number should be 4–20 letters or digits.');
    const pwError = validatePassword(f.password, f.confirmPassword);
    if (pwError) fail(pwError);
    const { needsConfirmation } = await signUp({
      email: f.email.trim(), password: f.password, fullName: f.fullName.trim(),
      registrationNumber: f.registrationNumber.trim(), departmentCode: f.departmentCode,
      academicYear: f.academicYear,
    });
    form.reset();
    setStatus(form, needsConfirmation
      ? 'Account created! Check your inbox and click the confirmation link, then sign in.'
      : 'Account created. You are signed in.', 'success');
  },

  async forgot(form) {
    const { email } = fieldsOf(form);
    if (!EMAIL_RE.test(email.trim())) fail('Enter a valid email address.');
    await requestPasswordReset(email.trim());
    // Same message whether or not the account exists, so this form can't
    // be used to discover which emails are registered.
    setStatus(form, 'If an account exists for that email, a reset link is on its way.', 'success');
  },

  async reset(form) {
    const { password, confirmPassword } = fieldsOf(form);
    const pwError = validatePassword(password, confirmPassword);
    if (pwError) fail(pwError);
    await updatePassword(password);
    form.reset();
    showToast('Password updated. You are signed in.');
    navigateFn(homePage());
  },

  async 'change-password'(form) {
    const { password, confirmPassword } = fieldsOf(form);
    const pwError = validatePassword(password, confirmPassword);
    if (pwError) fail(pwError);
    await updatePassword(password);
    form.reset();
    setStatus(form, 'Password updated.', 'success');
  },

  async profile(form) {
    const f = fieldsOf(form);
    if (f.full_name.trim().length < 2) fail('Enter your full name.');
    if (f.registration_number && !REGNO_RE.test(f.registration_number.trim())) fail('Registration number should be 4–20 letters or digits.');
    if (f.phone_number && !/^\+?[0-9 ]{7,20}$/.test(f.phone_number.trim())) fail('Phone number should contain 7–20 digits.');
    await updateProfile({
      full_name: f.full_name.trim(),
      registration_number: f.registration_number.trim() || null,
      phone_number: f.phone_number.trim() || null,
      department_id: f.department_id || null,
      academic_year: f.academic_year ? Number(f.academic_year) : null,
      semester: f.semester ? Number(f.semester) : null,
    });
    setStatus(form, 'Profile saved.', 'success');
  },
};

function onSubmit(event) {
  const form = event.target.closest('form[data-auth-form]');
  if (!form) return;
  event.preventDefault();
  const handler = handlers[form.dataset.authForm];
  if (!isConfigured) { setStatus(form, friendlyError(null)); return; }
  withBusy(form, async () => {
    try { await handler(form); }
    catch (err) { if (err instanceof ValidationError) { setStatus(form, err.message); return; } throw err; }
  });
}

// ---------------------------------------------------------------------
// Rendering: header chip, nav, demo ribbon, profile page
// ---------------------------------------------------------------------
function initials(name) {
  return (name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0].toUpperCase()).join('');
}

function renderHeader() {
  if (!isConfigured) return; // sample-data mode keeps the static persona
  const chip = $('.profile-chip');
  const p = authState.profile;
  if (chip) {
    // textContent (not innerHTML) so a name like "<img onerror=…>" is
    // shown as text, never executed.
    // Signed in, but the profile row could not be loaded: say so instead
    // of pretending the user is signed out.
    const orphan = !p && isSignedIn();
    const email = authState.session?.user?.email ?? '';
    $('.avatar', chip).textContent = p ? initials(p.full_name) : orphan ? initials(email) : '→';
    $('.profile-copy strong', chip).textContent = p ? p.full_name : orphan ? email : 'Sign in';
    $('.profile-copy small', chip).textContent = p ? ROLE_LABELS[p.role] : orphan ? 'Profile unavailable' : 'Students & staff';
    chip.dataset.nav = p || orphan ? 'profile' : 'login';
    chip.setAttribute('aria-label', p ? `Your profile: ${p.full_name}` : orphan ? `Signed in as ${email}` : 'Sign in');
  }
  const role = currentRole();
  $$('[data-requires-role]').forEach(link => { link.hidden = link.dataset.requiresRole !== role; });
}

function renderRibbon() {
  const ribbon = $('.evaluation-ribbon');
  if (!ribbon) return;
  if (isConfigured && !DEMO_MODE) { ribbon.hidden = true; return; }
  if (!isConfigured) return; // original sample persona switcher
  const label = $('#persona-label');
  const p = authState.profile;
  if (label) label.textContent = p ? `${p.full_name} (${ROLE_LABELS[p.role].toUpperCase()})` : 'Signed out';
  $$('.role-button').forEach(b => b.classList.toggle('is-active', b.dataset.role?.toLowerCase() === p?.role));
}

let switchingDemoAccount = false;

/** Called by app.js when a demo-persona button is clicked. Returns true if handled. */
export async function handleDemoPersona(role) {
  if (!isConfigured) return false;
  const email = DEMO_ACCOUNTS[role];
  if (!email) return true;
  if (isSignedIn()) {
    if (authState.profile?.email === email) { navigateFn(homePage()); return true; }
    switchingDemoAccount = true; // stop the SIGNED_OUT handler sending us to Home
    await signOut();
  }
  navigateFn('login');
  const form = $('form[data-auth-form="login"]');
  form.email.value = email;
  form.password.value = '';
  form.password.focus();
  setStatus(form, `Demo ${role.toLowerCase()} account selected. Enter the demo password.`, 'success');
  return true;
}

async function fillDepartmentSelects() {
  let departments;
  try {
    departments = await listDepartments();
  } catch (err) {
    // Don't leave an empty dropdown with no explanation.
    $$('[data-department-select]').forEach(select => {
      select.options[0].textContent = 'Couldn’t load departments (you can set this later)';
      select.disabled = true;
      select.title = friendlyError(err);
    });
    return;
  }
  $$('[data-department-select]').forEach(select => {
    select.disabled = false;
    const field = select.dataset.valueField;
    const keep = select.value;
    $$('option:not(:first-child)', select).forEach(o => o.remove());
    departments.forEach(d => select.add(new Option(`${d.name} (${d.code})`, d[field])));
    select.value = keep;
  });
}

let categoriesCache = null;
async function renderInterests() {
  const card = $('[data-interests-card]');
  const box = $('[data-interest-chips]');
  if (!card || !box) return;
  card.hidden = currentRole() !== 'student';
  if (card.hidden) return;
  try {
    categoriesCache ??= await listCategories();
  } catch (err) {
    $('[data-interests-status]').textContent = friendlyError(err);
    $('[data-interests-status]').classList.add('is-error');
    return;
  }
  let selected = new Set();
  try { selected = await loadMyInterestIds(); } catch (e) { console.error(e); }
  box.replaceChildren(...categoriesCache.map(c => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'interest-chip';
    b.textContent = c.name;
    b.dataset.categoryId = c.id;
    b.setAttribute('aria-pressed', String(selected.has(c.id)));
    return b;
  }));
}

async function onInterestClick(event) {
  const chip = event.target.closest('.interest-chip');
  if (!chip || chip.disabled) return;
  const status = $('[data-interests-status]');
  const next = chip.getAttribute('aria-pressed') !== 'true';
  chip.disabled = true;
  try {
    await setInterest(chip.dataset.categoryId, next);
    chip.setAttribute('aria-pressed', String(next));
    status.textContent = '';
  } catch (err) {
    status.textContent = friendlyError(err);
    status.classList.add('is-error');
  } finally {
    chip.disabled = false;
  }
}

function renderProfilePage() {
  const p = authState.profile;
  const form = $('form[data-auth-form="profile"]');
  if (!form) return;
  if (!p) {
    if (isSignedIn()) setStatus(form, authState.profileError || 'Your profile could not be loaded.');
    return;
  }
  $('[data-profile-heading]').textContent = `Hi, ${p.full_name.split(' ')[0]}`;
  $('[data-profile-role]').textContent = ROLE_LABELS[p.role];
  form.full_name.value = p.full_name ?? '';
  form.email.value = p.email ?? '';
  form.registration_number.value = p.registration_number ?? '';
  form.phone_number.value = p.phone_number ?? '';
  form.department_id.value = p.department_id ?? '';
  form.academic_year.value = p.academic_year ?? '';
  form.semester.value = p.semester ?? '';
}

function renderConfigNotes() {
  $$('[data-config-note]').forEach(n => {
    n.hidden = isConfigured && !clientLoadError;
    if (clientLoadError) n.textContent = 'Could not load the Supabase library (network problem?). Refresh the page to try again.';
  });
}

// Read errors that Supabase puts in the URL hash after an email link,
// e.g. "#error=access_denied&error_description=Email+link+is+invalid+or+has+expired".
function readAuthErrorFromUrl() {
  const hash = window.location.hash.slice(1);
  if (!hash.includes('error_description=')) return null;
  const params = new URLSearchParams(hash);
  history.replaceState(null, '', window.location.pathname + window.location.search);
  return params.get('error_description');
}

// ---------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------
export function initAuthUI({ navigate }) {
  navigateFn = navigate;
  document.addEventListener('submit', onSubmit);
  document.addEventListener('click', event => {
    if (event.target.closest('[data-action="sign-out"]')) {
      signOut().catch(err => showToast(friendlyError(err)));
    }
    onInterestClick(event);
  });

  renderConfigNotes();
  const urlError = readAuthErrorFromUrl();

  onAuthChange((state, event) => {
    renderHeader();
    renderRibbon();
    if (event === 'INITIAL' && urlError) {
      showToast(urlError);
      navigateFn('login');
    }
    if (event === 'PASSWORD_RECOVERY') navigateFn('reset-password');
    if (event === 'SIGNED_IN' && !state.recovery) {
      if (state.profile && !state.profile.is_active) {
        showToast('This account has been deactivated. Contact an administrator.');
      }
      if (!state.profile && state.profileError) {
        showToast(`Signed in, but your profile couldn’t be loaded: ${state.profileError}`);
      }
      const target = pendingPage && guardRoute(pendingPage) === pendingPage ? pendingPage : homePage();
      pendingPage = null;
      // Supabase may re-emit SIGNED_IN when the tab regains focus; only
      // react when the user is actually on a sign-in style page.
      const current = window.location.hash.slice(1);
      if (AUTH_PAGES.has(current) || !current) {
        navigateFn(target);
        if (state.profile) showToast(`Signed in as ${state.profile.full_name}.`);
      }
    }
    if (event === 'SIGNED_OUT') {
      if (switchingDemoAccount) { switchingDemoAccount = false; return; }
      showToast('You have been signed out.');
      navigateFn('landing');
    }
    if (state.profile) renderProfilePage();
  });

  if (isConfigured) fillDepartmentSelects();
}

/** app.js calls this whenever a page becomes visible. */
export function onPageShown(page) {
  if (page === 'profile') { renderProfilePage(); renderInterests(); }
}
