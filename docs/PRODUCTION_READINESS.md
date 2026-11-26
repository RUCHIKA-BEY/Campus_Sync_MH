# CampusSync — Production Readiness Review

**Review date:** 2026-11-25 · **Commit reviewed:** `e841074` (branch `main`, identical to `origin/main`)
**Mode:** read-only. Nothing was committed, pushed, deployed or changed in the hosted database. The only write is this file.

## Verdict: **NOT READY**

The code is in good shape: tests pass, there are no secrets, and the headers and guards are in place. However, **the hosted Supabase database is three migrations behind the code.** Migrations 9, 10 and 11 are not applied. Every function that registration, timetable conflicts, On-Duty, attendance, dashboards and recommendations depend on is missing remotely, so most of the app would fail in production. This becomes **READY WITH CONDITIONS** once blocker B1 is fixed and the conditions in §3 are met.

---

## 1. Blockers (must fix before release)

### B1. Migrations 9–11 are not applied to the hosted database

There are two independent pieces of evidence.

**(a) `npx supabase migration list --linked`** (read-only), run against linked project `zmnhoeytxufogxquixpt`, which is the same project as `VITE_SUPABASE_URL`:

| Migration | Local | Remote |
|---|---|---|
| 20261111000100 … 20261111000600 (1–6) | ✓ | ✓ |
| 20261124000100 explicit grants (7) | ✓ | ✓ |
| 20261124000200 event lifecycle (8) | ✓ | ✓ |
| **20261124000300 registration & conflicts (9)** | ✓ | **✗** |
| **20261124000400 OD & attendance (10)** | ✓ | **✗** |
| **20261124000500 dashboards & recommendations (11)** | ✓ | **✗** |

**(b) Anonymous RPC existence probe.** All 37 designed functions were called with the public key and no user token. Code `42501` means the function exists but anonymous callers are refused before it runs, so there are no side effects. Code `PGRST202` means the function does not exist.

| Migration | Functions | Result |
|---|---|---|
| 5 (roles) | current_app_role, has_role, is_club_manager, manages_event, can_review_od, admin_set_user_role, admin_set_user_active | 7/7 **exist** |
| 8 (lifecycle) | submit_event, reopen_event, start_event_review, review_event, publish_event, complete_event, cancel_event | 7/7 **exist** |
| 9 | check_timetable_conflict, register_for_event, cancel_registration, get_event_seats, event_scheduling_warnings, get_event_registrants | **0/6, missing** |
| 10 | request_od, withdraw_od, decide_od, get_od_queue, my_od_requests, open_attendance_session, close_attendance_session, check_in, mark_attendance_manual, revoke_attendance, get_event_attendance, my_attendance | **0/12, missing** |
| 11 | student_dashboard, organizer_dashboard, dsa_dashboard, admin_dashboard, get_recommendations | **0/5, missing** |

**Impact in production:**
- Visitors: seat counts fail, because `get_event_seats` is missing.
- Students: no "Can I attend?" check, registration, QR pass, OD or dashboard.
- Organizers: no registrant list, check-in or attendance.
- DSA: no OD queue.
- Admin: no overview charts.

> **Update (migration 12 added later):** the frontend now also reads columns from migration 12 (`banner_url`, venue requests). Until migrations 9–**12** are applied, **every event list on the site fails (HTTP 400)**. Apply the database first, then deploy the frontend.

**Fix (you run it; the review did not):**

```powershell
npm run db:push:dry
```
Expect it to list the three migrations above **plus `20261125000100_dsa_events_venue_requests_media`**, then:
```powershell
npm run db:push
```
Then run `supabase/verify_setup.sql` in the SQL Editor. Expect history count `12` and latest version `20261125000100` (both checked by the updated checklist). Finally, re-run the probe (or `npm run check:supabase`).

> Note: if Stages 6–8 were tested earlier with "all good", that testing was not against this hosted project's current schema. It may have been the local PGlite tests or sample mode. The hosted acceptance tests in §5 must be re-run after the push.

---

## 2. Warnings (should fix, or accept knowingly)

| # | Finding | Evidence | Recommendation |
|---|---|---|---|
| W1 | **Demo mode is ON by default.** `DEMO_MODE = (VITE_DEMO_MODE ?? 'true') !== 'false'`, and the local `.env.local` sets `VITE_DEMO_MODE=true`. The sign-in page lists 4 demo emails, including **admin**. | `web/src/lib/env.ts:36`; demo emails present in `dist` bundle | For a real launch, set `VITE_DEMO_MODE=false` in Vercel. For the evaluation, keeping it is acceptable, but use a strong `DEMO_PASSWORD` and plan to deactivate or delete the demo admin afterwards. Passwords are never bundled (verified). |
| W2 | `main` is already pushed at `e841074`. If the Vercel project auto-deploys `main`, **production is already serving this build against the un-migrated database.** | `git status`: main = origin/main | Check the Vercel dashboard. If deployed, apply B1 promptly; the frontend itself is not the problem. |
| W3 | No `Strict-Transport-Security` header. | `vercel.json` | Vercel adds HSTS on `*.vercel.app` and custom domains by default. Confirm on the preview (`curl -I`). Optionally add `max-age=63072000; includeSubDomains`. |
| W4 | CSP `connect-src` and `img-src` allow every `*.supabase.co` project. | `vercel.json`, `web/csp.ts` | Optional hardening: pin to `https://zmnhoeytxufogxquixpt.supabase.co` and `wss://zmnhoeytxufogxquixpt.supabase.co`. |
| W5 | `style-src 'unsafe-inline'`. | CSP | Accepted: needed for React `style` attributes and Motion. Scripts are still `'self'` only. |
| W6 | `.claude/` is untracked and not git-ignored. It holds local launch configs. | `git status` | Add `.claude/` to `.gitignore`; don't commit it. |
| W7 | Legacy `public/` (old vanilla app) is still tracked. It isn't served, because Vite's root is `web/` and dist contains no legacy files (verified). `public/js/config.js` contains only the publishable key. | `git ls-files public` | Delete it in a separate cleanup commit, or keep it as history (decision pending). |
| W8 | `docs/SECURITY.md` §7 and §9 still mention `/js/supabase-client.js` and `public/js/config.js` (legacy paths). | doc text | Doc-only fix: in the React app the console snippet must use `window` access or a fetch with the session token. |

## 3. Accepted limitations (documented, not blocking)

- Notifications are in-app only (no email or push).
- The QR pass is static, so screenshot forwarding is mitigated by the name check, not prevented.
- OD isn't integrated with official university records.
- Feedback and server-side saved events have no UI.
- Concurrency correctness relies on PostgreSQL row locks; it hasn't been load-tested.
- Supabase's built-in email sender is rate-limited. Custom SMTP is recommended if many users sign up or reset passwords.
- Frontend route guards (`Protected`) are UX only. Authorization is enforced by GRANTs, 75 RLS policies and in-function checks (covered by 126 DB tests).

## 4. Production configuration requirements

### Vercel project settings

| Setting | Value | Source |
|---|---|---|
| Framework preset | Other (Vite is driven by `vercel.json`) | |
| Install command | `npm ci` | `vercel.json` |
| Build command | `npm run build` (`tsc` + `vite build --config web/vite.config.ts`) | `vercel.json` |
| Output directory | `dist` | `vercel.json` |
| Rewrites | `/(.*)` → `/index.html` (SPA deep links) | `vercel.json` |
| Node version | 20.x or newer | |

### Environment variables (set for **both** Preview and Production)

| Name | Exposed to browser? | Value |
|---|---|---|
| `VITE_SUPABASE_URL` | Yes, public by design | `https://<project-ref>.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Yes, public by design | `sb_publishable_…` (the build **fails** if it starts with `sb_secret_`) |
| `VITE_DEMO_MODE` | Yes | `false` for real use; `true` only for the evaluation |
| `SUPABASE_SECRET_KEY`, `SUPABASE_DB_PASSWORD`, `DEMO_PASSWORD` | **Never.** Do **not** add these to Vercel. | Local `.env` only |

The build guard throws on Vercel if either `VITE_SUPABASE_*` variable is missing. This prevents a silent sample-mode deployment.

### Supabase Auth → URL Configuration

- **Site URL:** the production domain, e.g. `https://campussync.vercel.app`.
- **Redirect URLs:**
  - `https://<production-domain>/**`
  - `https://*-<vercel-team-slug>.vercel.app/**` (preview deployments)
  - `http://localhost:5500/**` (local development)
- These cover email confirmation and password-reset links (`/reset-password`, implicit flow).

## 5. Test results

| Check | Result |
|---|---|
| `npm run typecheck` (strict TS) | ✅ pass |
| `npm run test:web` (Vitest) | ✅ 44/44 |
| `npm run test:db` (PGlite, real Postgres + RLS as `anon`/`authenticated`) | ✅ 126/126, including the security audit (exact function allow-list, pinned `search_path`, no anon write privilege, RLS on every table) |
| `npm run build` | ✅. `dist/` contains only `index.html`, `assets/` and 4 images; no legacy files |
| Secret scan of `dist/` and git history | ✅ no `sb_secret_` value and no service-role JWT; only the publishable key and URL (expected) |
| Production preview (`vite preview` with production headers) | ✅ 17 routes return 200 + SPA shell; deep link `/events/hackgrid` renders; `/admin` while signed out → `/login`; unknown route → "Page not found"; no console errors |
| Hosted migration history | ❌ 8/11 (see B1) |
| Hosted function existence | ❌ 14/37 (see B1) |
| Hosted authenticated workflows | ⏸ **not tested live** in this review (the review used no credentials). Run §6 after B1. |

## 6. Manual acceptance tests (run on the Vercel **preview** after B1)

Use the four demo accounts. ✔ = expected result.

**Visitor**
1. Home and Discover load with seat counts ✔.
2. `/events/<slug>` deep link loads ✔.
3. `/admin` → redirect to login ✔.

**Student**
1. Sign up → profile is created as *student* ✔.
2. Timetable: add a class ✔. Add an overlapping class → refused ✔.
3. Event page → *Can I attend?* shows the clash ✔.
4. Register → QR pass ✔. Seats go down by 1 ✔.
5. Request On-Duty ✔ (appears in My Events).
6. Home dashboard and recommendations show data ✔.
7. Bell shows notifications; mark as read ✔.

**Organizer**
1. Create a draft → Submit ✔.
2. A second event at the same venue and time → venue clash refused ✔.
3. After approval → Publish ✔.
4. Registrants list (no emails or phones) ✔.
5. Check-in → open a session → scan the student's pass ✔. A second scan is refused ✔.
6. Manual mark ✔.

**DSA**
1. Review desk → Start review → Request changes (needs a 10+ character note) ✔.
2. Approve the resubmission ✔.
3. OD queue → Approve ✔. Approval creates **no** attendance ✔.

**Admin**
1. Overview charts load ✔.
2. Change a user's role ✔. Your own role can't be changed ✔.
3. The audit log shows each action ✔.

**Negative authorization tests** (signed in, in the DevTools console of the deployed site, or by trying to use the UI route directly):

| As | Attempt | Expected |
|---|---|---|
| Student | open `/organizer`, `/dsa`, `/admin` | redirected / "no access" |
| Student | `profiles.update({role:'admin'})` on self | `permission denied` |
| Student | `rpc('admin_set_user_role', …)` | "Only administrators…" |
| Student | `rpc('decide_od', …)` / `rpc('review_event', …)` | refused (42501 / business error) |
| Student | `from('timetable_slots').select()` | only own rows |
| Organizer | `rpc('review_event')` on own event | refused (no self-review / not DSA) |
| Organizer | update another club's draft | 0 rows changed |
| Organizer | `rpc('get_event_registrants')` for another club's event | refused |
| DSA | `rpc('admin_set_user_role')` | refused |
| DSA | read another user's `timetable_slots` | 0 rows |
| Admin | `rpc('admin_set_user_role')` on self | refused |
| Anyone | `from('audit_logs').delete()` | refused (append-only) |

## 7. Release and rollback plan

1. **Review.** Read this report and decide on W1–W8.
2. **Database first (B1).** Run `npm run db:push:dry`, then `npm run db:push`, then `verify_setup.sql`. The migrations are additive (new functions and grants), so the existing frontend keeps working while they apply.
3. **Commit** any doc or `.gitignore` changes (you run the commands).
4. **Vercel preview.** Push a branch or open a PR, and confirm the env vars are set for *Preview*.
5. **Test on the preview.** Run the §6 checklist, and check headers with `curl -I <preview-url>` (CSP, nosniff, X-Frame-Options, HSTS).
6. **Promote.** Merge to `main`, or use "Promote to Production" in Vercel.
7. **Verify production.** Repeat the §6 smoke tests (visitor plus one sign-in per role) and check the browser console for CSP violations.
8. **Rollback:**
   - **Frontend:** in Vercel → Deployments, choose the previous good deployment → *Instant Rollback* (no rebuild).
   - **Database:** migrations 9–11 only *add* functions, grants and triggers. Rolling back the frontend doesn't require reverting them, because older frontends simply don't call the new functions. Only revert the schema with a new, reviewed down-migration (never by editing applied files), and take a backup first (Dashboard → Database → Backups).
   - **Secrets:** if a secret key is ever exposed, rotate it in Supabase → API Keys and update the local `.env`.

## 8. Deployment checklist

- [ ] B1: `db:push` applied; history = 11; probe shows 37/37 functions
- [ ] Vercel env (Preview **and** Production): `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_DEMO_MODE`
- [ ] No secret variables in Vercel
- [ ] Supabase Site URL and Redirect URLs set for production, preview and localhost
- [ ] `.claude/` added to `.gitignore`
- [ ] Preview passes §6, including the negative tests
- [ ] Headers confirmed with `curl -I` (CSP, nosniff, DENY, Referrer-Policy, Permissions-Policy, HSTS)
- [ ] Demo mode decision recorded; strong `DEMO_PASSWORD`; plan to remove the demo admin after the evaluation
- [ ] Promote → production smoke test → note the rollback deployment id
