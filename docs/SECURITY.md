# CampusSync — Security: Roles, RLS and Trusted Functions

> **One sentence for the viva:** the browser decides what to *show*; PostgreSQL decides what is *allowed*, using the logged-in user's id from a signed token. Hiding a button protects nothing.

---

## 1. Why frontend checks are not enough

The publishable key and our JavaScript are downloaded by every visitor. Anyone can open DevTools and run:

```js
await supabase.from('profiles').update({ role: 'admin' }).eq('id', myId)
```

No button was clicked, and no frontend check ran. The only thing that can stop this is the **database**. In CampusSync it fails with `permission denied` (test: *"student can edit own personal fields but NOT role"*).

## 2. The three layers of protection

| Layer | Answers | Example in CampusSync |
|---|---|---|
| **Table/column privileges** (`GRANT`/`REVOKE`) | *Which operations and columns* may browser users touch at all? | Students may `UPDATE` only `full_name, registration_number, department_id, academic_year, semester, phone_number, avatar_url` on `profiles`. `role` isn't in the list. |
| **Row Level Security policies** | *Which rows?* | You may update **your own** profile row only. |
| **Constraints and triggers** | *Is the data valid?* | `events_no_self_review`, `events_no_venue_double_booking`, append-only `audit_logs`. |

All three must allow an operation for it to succeed.

## 3. RLS from scratch

**Row Level Security** attaches a condition to a table that PostgreSQL adds to **every query** automatically.

```sql
create policy "timetable: read own" on public.timetable_slots
  for select to authenticated
  using (student_id = (select auth.uid()));
```

When Priya runs `select * from timetable_slots`, PostgreSQL actually executes `... where student_id = '<Priya's id>'`. She can't remove that filter, because it's added inside the database.

- **`auth.uid()`** returns the user id from the request's JWT. Supabase verifies the JWT's signature first, so it can't be forged. Not logged in → `NULL` → own-row policies match nothing.
- **`to anon` / `to authenticated`**: logged-out vs logged-in requests.
- **Deny by default.** With RLS on and no policy for an operation, it's impossible. Migration 3 enabled RLS on all 21 tables *before* any policy existed.

### `USING` vs `WITH CHECK`

| Clause | Checked against | Used by |
|---|---|---|
| `USING (...)` | rows that **already exist** (which rows can I see / target?) | SELECT, UPDATE, DELETE |
| `WITH CHECK (...)` | the row **as it will be after** the write | INSERT, UPDATE |

UPDATE needs **both**. Example from `events`:

```sql
for update
using      (is_club_manager(club_id) and status in ('draft','changes_requested'))  -- may I touch this row now?
with check (is_club_manager(club_id) and status in ('draft','changes_requested'))  -- is the result still mine and editable?
```

Without `WITH CHECK`, an organizer could edit their draft and set `club_id` to a club they *don't* manage, "giving" the event away. The test *"organizer can edit own club drafts but not another club's events"* proves it's blocked.

### Two behaviours that surprise beginners (both covered by tests)

1. **A blocked INSERT raises an error** (`new row violates row-level security policy`).
2. **A blocked UPDATE/DELETE raises no error. It matches 0 rows**, because the rows are invisible. The frontend must treat "0 rows changed" as failure.

## 4. Roles

`profiles.role` ∈ `student | organizer | dsa | admin`, default `student`.

| How a role changes | Allowed? |
|---|---|
| Public sign-up | Always `student`. A `role` in signup metadata is ignored. |
| User edits own profile | ✗ `role` has no column privilege → `permission denied` |
| Admin, inside the app | ✓ `admin_set_user_role(user, role)`: checks the caller is an **active admin**, refuses changing **their own** role, writes `audit_logs`, notifies the user |
| Operator in Supabase SQL editor / demo script | ✓ owner rights (first admin bootstrap) |

**Organizer scope (decision D4)** needs *both*:
1. `profiles.role = 'organizer'` (granted by an admin), and
2. an `active` `club_members` row with `membership_role` `lead` or `coordinator` for that club.

Demoting an organizer to student instantly removes access to their club's drafts, even if the membership row remains (test: *"organizer role alone … demotion revokes access"*).

**Deactivated users** (`is_active = false`) lose every role-based power, because `current_app_role()` returns NULL for them.

## 5. SECURITY DEFINER functions

A normal function runs with the **caller's** rights. A `SECURITY DEFINER` function runs with its **owner's** rights. It's powerful, so every one in CampusSync follows these rules (checked automatically by the test *"every SECURITY DEFINER function pins search_path"*):

1. `set search_path = ''`, and every table is written fully qualified as `public.profiles`. This stops a user from creating a fake `profiles` object that the function would find first.
2. It checks the caller (`auth.uid()`, `has_role(...)`) before acting.
3. `EXECUTE` is revoked from roles that shouldn't call it.

| Function | Why DEFINER is needed | Who may call |
|---|---|---|
| `current_app_role()`, `has_role()`, `is_club_manager()`, `manages_event()`, `can_review_od()` | Policies on `profiles` / `club_members` need to read those tables; reading them under RLS would recurse forever. They return facts **about the caller only**. | authenticated |
| `handle_new_user()`, `handle_user_email_change()` | Triggers on `auth.users` must write `profiles`, which browser users cannot insert into. | trigger only |
| `admin_set_user_role()`, `admin_set_user_active()` | Must change `role` / `is_active`, which no browser role can write. Checks for an active admin inside. | authenticated (checked inside) |
| `write_audit()`, `notify()` | Internal building blocks for the workflow functions in later stages. | **nobody** from the browser |

## 6. Permission matrix (as implemented in migration 6)

R read · I insert · U update · D delete · *own* = your rows · *club* = clubs you lead/coordinate · **fn** = only through a checked function (Stages 5–7) · — none

| Table | Visitor | Student | Organizer | DSA | Admin |
|---|---|---|---|---|---|
| departments, categories, venues | R | R | R | R | R I U D |
| academic_terms, platform_settings | — | R | R | R | R I U D (settings: R U) |
| profiles | — | R U own (limited columns) | R U own | R all · U own | R all · U · role via **fn** |
| student_interests, saved_events, club_follows | — | R I D own | R I D own | R I D own | R I D own |
| clubs | R active | R active | R active | R active | R I U D |
| club_members | — | R own | R own + club | R all | R I U D |
| events | R public¹ | R public¹ | R club · I draft · U draft/changes_requested · D draft · status via **fn** | R non-draft · decide via **fn** | R all · D draft |
| event_audiences | R if event visible | same | + I D on editable club events | R | R |
| event_registrations | — | R own · I/cancel via **fn** | R club events | R all | R all |
| timetable_slots | — | R I U D **own only** | own only | own only | own only |
| od_requests | — | R own · I via **fn** | R club events | R all (if reviewer²) · decide via **fn** | R all |
| attendance_sessions | — | — | R club · open via **fn** | R | R |
| attendance_records | — | R own | R club · I via **fn** | R | R |
| event_feedback | — | R own · I own³ | R club events | R | R |
| notifications | — | R own · U `is_read` only | same | same | same |
| audit_logs | — | — | — | — | R only (nobody can U/D/truncate) |

¹ `published`, `completed`, or `cancelled` after having been published.
² `platform_settings.od_reviewer_roles` (default `["dsa"]`).
³ The foreign key to `attendance_records` makes feedback impossible without attendance.

**Privacy choice:** nobody, not even DSA or admin, reads another person's timetable. Others only see the conflict *summary* saved on a registration or OD request.

## 7. How to test unauthorised access yourself

**Automated:** `npm run test:db` runs 31 authorization tests as simulated browser users (see [TESTING.md](TESTING.md)).

**Manually, against your real project:** sign in as the demo student, open DevTools → Console, and try:

```js
const { supabase } = await import('/js/supabase-client.js');
const { data: { user } } = await supabase.auth.getUser();

// 1. Promote yourself → error: permission denied for table profiles
await supabase.from('profiles').update({ role: 'admin' }).eq('id', user.id);

// 2. Read everyone's timetable → returns only your own rows
await supabase.from('timetable_slots').select('*');

// 3. Create a venue → error: new row violates row-level security policy
await supabase.from('venues').insert({ name: 'Hacked Hall', capacity: 10 });

// 4. Call the admin function → error: Only administrators can change roles
await supabase.rpc('admin_set_user_role', { p_user_id: user.id, p_role: 'admin' });
```

## 8. Browser-side defences

- **Content-Security-Policy** (`web/csp.ts`, sent by Vercel): scripts only from CampusSync's own origin, network requests only to `*.supabase.co`, no framing (`frame-ancestors 'none'`), no plugins. An injected `<script>` wouldn't run.
- Other headers: `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `X-Frame-Options: DENY`, and `Permissions-Policy` (camera allowed only for our own pages, for QR scanning).
- React escapes all text, and there's no raw HTML rendering anywhere (audited).

## 9. Secrets

| Value | Where it may live |
|---|---|
| Project URL, **publishable** key | `public/js/config.js` (public by design) |
| **Secret** key, DB password, `DEMO_PASSWORD` | `.env` on your machine only (git-ignored) |

The secret key **bypasses RLS completely**. It's used only by `scripts/create-demo-users.mjs`, which runs locally.

## 10. Workflow writes and remaining limitations

- Workflow writes (register, submit/approve/publish, OD decisions, check-in) **deliberately have no direct table policies or GRANTs**. They happen only inside the checked functions listed in API_REFERENCE.md, and `tests/db/security_audit.test.js` pins exactly which functions each role may call.
- Organizers see registrants only through `get_event_registrants` (name, registration number, department, year and clash status; never email or phone). Profiles otherwise stay private.
- The QR pass is static: screenshot forwarding is mitigated by the organizer's name check, not prevented.
- Supabase's built-in email sender is rate-limited. Custom SMTP is optional, and notifications are in-app only.
- The sign-in page's demo accounts exist for evaluations. Set `VITE_DEMO_MODE=false` for real use.
