# CampusSync — Authentication

How people get accounts, prove who they are, and stay signed in.
For *what* each role may do, see [SECURITY.md](SECURITY.md).

---

## 1. The pieces

| Piece | Where | Job |
|---|---|---|
| **Supabase Auth** | Supabase (hosted) | Stores emails and **hashed** passwords, sends confirmation/reset emails, issues tokens. We never see or store passwords. |
| `auth.users` | Supabase's own table | One row per account. Managed by Supabase Auth only. |
| `public.profiles` | Our table (migration 2) | One row per account with *our* data: name, registration number, department and **role**. Same `id` as `auth.users`. |
| `handle_new_user()` | Trigger (migration 5) | Creates the profile automatically when an account is created. |
| `public/js/supabase-client.js` | Browser | Creates the one Supabase client, using the public URL + publishable key. |
| `public/js/auth.js` | Browser | Sign up/in/out, reset, session restore, loading the profile. No DOM code. |
| `public/js/auth-ui.js` | Browser | The forms, header chip, role-aware navigation, route guard and demo bar. |

### `auth.users` ↔ `profiles`

```
auth.users (Supabase)                public.profiles (ours)
┌──────────────────────────┐  1 : 1  ┌────────────────────────────────┐
│ id  3f2a…                │◀───────│ id  3f2a…  (PK and FK)          │
│ email, encrypted_password │        │ role = 'student'               │
│ email_confirmed_at, …     │        │ full_name, registration_number │
└──────────────────────────┘        │ department_id, academic_year…  │
                                     └────────────────────────────────┘
```

`profiles.id` is both the primary key and a foreign key to `auth.users.id` with `ON DELETE CASCADE`, so deleting an account removes its profile.

---

## 2. Sign-up, step by step

```
Browser                         Supabase Auth                    PostgreSQL
───────                         ─────────────                    ──────────
signUp(email, password,  ──▶  hash password, insert
  data:{full_name,…})          into auth.users  ───────────▶  TRIGGER handle_new_user()
                                                               • reads full_name, reg. no,
                                                                 department_code, year
                                                               • sanitises them
                                                               • INSERT profiles (role
                                                                 omitted → default 'student')
                                  ◀──── same transaction: both rows or neither
               ◀── "check your inbox" (email confirmation on)
```

Points to remember for the viva:

- **The role is never read from the signup request.** Our tests send `{"role":"admin"}` in the metadata, and the profile is still `student`.
- **Bad metadata doesn't break signup.** An invalid or already-used registration number, or an unknown department, is stored as `NULL`. The student can fix it on the Profile page.
- **No passwords in our tables.** Supabase stores only a bcrypt hash in `auth.users`.

## 3. Sign-in, sessions and tokens

1. `signInWithPassword` sends email + password to Supabase Auth over HTTPS.
2. Supabase returns a **session** containing:
   - an **access token**: a *JWT* (JSON Web Token), a signed piece of text saying "this is user `3f2a…`, valid until 10:45". It expires after about 1 hour.
   - a **refresh token**, used to get a new access token without asking for the password again.
3. supabase-js saves the session in `localStorage` (`persistSession: true`) and refreshes it automatically (`autoRefreshToken: true`).
4. **Every database request carries the access token.** PostgreSQL reads the user id from it with `auth.uid()`, and RLS policies use that id.

**Session restore on refresh:** `initAuth()` calls `supabase.auth.getSession()` *before* the first page is chosen (`await initAuth()` in `app.js`). So refreshing on `#profile` keeps you on Profile instead of flashing the sign-in page.

**Why localStorage can't grant permissions:** someone can edit the stored session, but the JWT is **signed** by Supabase. A modified token fails signature checking, and the database rejects it. The role is read from `profiles` on the server, not from anything the browser stores.

## 4. Password reset

```
Forgot password form → resetPasswordForEmail(email, redirectTo: site)
   → email with link → user clicks → returns to site with tokens in the URL hash
   → supabase-js detects them → event PASSWORD_RECOVERY
   → app shows "Choose a new password" → updateUser({ password })
```

- The form shows the **same message whether or not the email exists**, so it can't be used to find out who has an account.
- We use the **implicit flow** (`flowType: 'implicit'`), so the link also works when opened in a different browser or on a phone. (The PKCE flow only works in the browser that requested it.)
- Expired or invalid links come back as `#error_description=…`. The app shows that message and opens Sign in.

## 5. Route protection (user experience, not security)

`guardRoute()` in `auth-ui.js`:

| Page | Rule |
|---|---|
| Home, Discover, Clubs, Sign in, Sign up, Forgot | public |
| Timetable, Registrations, Profile | must be signed in → otherwise Sign in, then back to the page you wanted |
| Organizer / DSA / Admin console | must have that role → otherwise your home page plus a message |
| Reset password | only after clicking a reset link |

The guard only decides **what to show**. If someone deletes it from the JavaScript, they see empty screens: the database still refuses every unauthorised read and write (proven by `tests/db/auth_rls.test.js`).

## 6. Sample-data mode vs connected mode

| | `public/js/config.js` keys empty | keys filled in |
|---|---|---|
| Data | built-in sample data (as before) | sample data until Stage 9 wires the database |
| Sign in / Sign up | shows "backend not connected" | real Supabase Auth |
| Evaluation bar | original persona switcher | pre-fills a demo account's email (`DEMO_MODE`) |
| Supabase library | not downloaded at all | loaded from a pinned CDN version (2.118.0) |

**Why the demo bar doesn't log in with one click:** that would need the demo password inside public JavaScript. Anyone could then sign in as the demo *admin* on the deployed site and change real users' roles. The bar fills in the email, and the presenter types the password. For a real deployment, set `DEMO_MODE = false`.

---

## 7. Setup guide (manual steps, done by you)

### 7.1 Create the project
1. Sign in at supabase.com → **New project**. A free plan is fine. Choose a region close to you (e.g. Mumbai).
2. Save the database password in your password manager. **It never goes in the repo.**

### 7.2 Apply the database (one paste)
1. On your machine, generate the bundle (all 6 migrations + seed in one transaction):

```bash
npm run db:bundle
```

2. Open `supabase/.bundle/setup_all.sql`, copy **everything**, paste it into **SQL Editor → New query**, and press **Run**. If Supabase warns about "destructive operations", that's caused by the `REVOKE` statements; confirm to run.
3. It succeeds completely or not at all. On an empty project, a failure means nothing was applied, so you can fix the problem and run it again.
4. **Verify:** paste `supabase/verify_setup.sql` into a new query and Run. All 17 rows should show ✅.

(Production projects: use `npm run db:bundle -- --no-seed` to skip the fictional demo data.)

### 7.3 Connect the frontend
1. Click **Connect** at the top of your project dashboard. It shows the **project URL** (`https://<ref>.supabase.co`) and the **publishable** key (`sb_publishable_…`). Both are also listed under **Settings → API Keys**.
2. Paste both into `public/js/config.js`. **Never** the secret key (`sb_secret_…`).
3. Check from your machine (it uses only the public key, and creates and changes nothing):

```bash
npm run check:supabase
```

### 7.4 Configure Auth
**Authentication → Sign In / Providers** (Auth Providers page): Email is enabled by default. Leave **Confirm email** on. Our frontend requires passwords of 8+ characters with a letter and a number. If your dashboard offers a minimum-length setting, set it to 8 so the server enforces it too.

**Authentication → URL Configuration**:
- **Site URL**: your Vercel URL (e.g. `https://campussync.vercel.app`). Until you deploy, use `http://localhost:5500`.
- **Redirect URLs**: add `http://localhost:5500/**` and `https://<your-vercel-domain>/**`. (`**` matches any path.)

> ⚠ Supabase's built-in email sender allows only about **2 emails per hour**. Each sign-up confirmation and password-reset email counts. Test real sign-up sparingly, and use the demo accounts (7.5) for everyday testing, because they're created already confirmed and need no email. For heavier use, configure custom SMTP.

### 7.5 Create the demo accounts
1. Copy `.env.example` to `.env`. Fill in `SUPABASE_URL`, `SUPABASE_SECRET_KEY` (from **Settings → API Keys**, the `sb_secret_…` key; create one there if none exists) and a `DEMO_PASSWORD` of 12+ characters with letters and numbers.
2. Run:

```bash
npm run demo:users
```

This creates `student.demo@…`, `organizer.demo@…` (lead of IEEE Student Branch), `dsa.demo@…` and `admin.demo@…`, already confirmed.

### 7.6 Create the first real admin (if not using the demo admin)
Sign up normally through the app, then in **SQL Editor** (which runs with owner rights) run:

```sql
update public.profiles set role = 'admin'
where lower(email) = lower('your.email@university.edu');
```

After that, that admin promotes others from inside the app (`admin_set_user_role`, audited). There's deliberately **no** way to become admin from the browser.

### 7.7 Run locally
```bash
python -m http.server 5500 --directory public
```
Then open `http://localhost:5500`.

---

## 8. What can go wrong

| Symptom | Likely cause |
|---|---|
| "Too many attempts" / no email arrives | The built-in sender's ~2 emails/hour limit. Wait, or use the demo accounts. |
| `verify_setup.sql` shows ❌ | Note which row; usually the bundle wasn't run, or was run on a project that already had tables. |
| "Email not confirmed" | The user hasn't clicked the confirmation link (or it went to spam). |
| Reset/confirm link opens the site but nothing happens | That URL is missing from **Redirect URLs** (7.4). |
| "Database error saving new user" during sign-up | Migrations 1–5 weren't all applied, so the profile trigger failed. |
| Signed in but the header says "Sign in" | The profile row is missing or `profiles` RLS policies weren't applied (migration 6). |
| Everything shows "backend not connected" | `config.js` keys are empty, or the CDN couldn't be reached. |
