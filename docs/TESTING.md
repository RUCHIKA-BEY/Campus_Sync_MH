# CampusSync — Testing

## How the database tests work

There's no Docker on the development machine, so the tests use **PGlite**: real PostgreSQL (v18) compiled to WebAssembly and run inside Node.js. Each test run:

1. starts an empty in-memory PostgreSQL,
2. applies `tests/db/supabase_shim.sql`, a **test-only** stand-in for the `auth` schema and the `anon`/`authenticated` roles that every real Supabase project already has,
3. applies every file in `supabase/migrations/` in filename order, then `supabase/seed.sql`,
4. runs each test inside a transaction that is **rolled back** afterwards, so tests can't affect each other.

Tests check the **constraint name** in each error, not just "an error happened". That proves the *right* rule rejected the bad data.

```bash
npm install
```

```bash
npm run test:db
```

## Stage 3 results (run 2026-11-11, PGlite 0.5.12 / PostgreSQL 18.6)

**30 / 30 passed.**

| Area | What is proven |
|---|---|
| Setup | migrations + seed apply cleanly; seed is re-runnable; RLS is enabled on all 21 tables |
| RLS lockdown | a logged-in user sees 0 rows, INSERT is refused, and an UPDATE trying `role = 'admin'` changes nothing |
| Profiles | default role `student`; invalid role rejected; email and registration number unique ignoring case; auth-user delete cascades; `updated_at` is set by the DB, not the client |
| Events | end after start; registration closes before start; capacity > 0; only drafts may omit a venue; **no self-approval**; rejection and cancellation need a reason |
| Venue collision | overlap rejected; event fully inside another rejected; **adjacent (12:00/12:00) allowed**; other venue allowed; same instant in a different timezone still collides; drafts don't hold the venue; cancelling releases it |
| Registrations | duplicate active registration rejected; re-register after cancel allowed with history kept; pass code is 32 random hex characters and unique |
| OD | student/event must match the registration; one active request; new request allowed after rejection; rejection needs a note; **approval creates no attendance** |
| Attendance | no duplicate check-in; QR needs a session **of the same event**; no check-in without a registration for that event |
| Feedback | impossible without attendance; one per student |
| Timetable | overlapping classes rejected; adjacent allowed; end > start; day 1–7 |
| Terms | overlapping terms rejected |
| Notifications | `dedupe_key` stops duplicates from retried operations |
| Audit log | UPDATE, DELETE and TRUNCATE blocked, even for the table owner; browser roles hold no such grants |

## Stage 4 results (run 2026-11-11): authentication + RLS

**Database: 60 / 60 passed** (29 schema tests + 31 in `tests/db/auth_rls.test.js`). Each authorization test switches to the real `authenticated`/`anon` role with a simulated JWT, the way Supabase does.

| Master-prompt requirement | Test(s) | Result |
|---|---|---|
| Profile initialization on signup | *signup creates a student profile…*, *sanitises bad metadata* | ✔ |
| Public signup can't request a role | *signup IGNORES a requested role* | ✔ |
| Student cannot modify their role | *student can edit own personal fields but NOT role…* | ✔ permission denied |
| Unauthorized user cannot access admin operations | *only an admin can change roles…*, *deactivated admin loses…*, *internal helpers… cannot be called* | ✔ |
| Student cannot approve an event | *student and DSA cannot change event status directly* | ✔ |
| Organizer cannot approve own event | *organizer CANNOT approve or publish their own event* | ✔ |
| Organizer cannot modify another club's event | *organizer can edit own club drafts but not another club's* | ✔ |
| Student cannot edit another student's timetable | *timetable: private to its owner…* | ✔ |
| Student cannot read another student's OD request | *students see only their own registrations and OD requests* | ✔ |
| Direct API requests cannot bypass RLS | every test above runs as the API role; plus *students cannot create registrations, OD or attendance directly* | ✔ |
| Audit log protected | *audit log: admin can read but not alter* | ✔ |
| Safe SECURITY DEFINER | *every SECURITY DEFINER function pins search_path* | ✔ |

**Frontend (manual, in-browser at 1280px and 375px):**

| Check | Result |
|---|---|
| Sample-data mode unchanged: landing shows 6 events, persona bar works, Timetable reachable | ✔ |
| Sign in/up show a "backend not connected" note and a clear error | ✔ |
| No horizontal scroll on login/signup/forgot/landing/discover at 375px | ✔ |
| Connected mode (fake project URL): supabase-js 2.118.0 loads from CDN; protected pages redirect to Sign in with a message; Admin requires a role | ✔ |
| Validation: bad email, weak password, mismatched passwords | ✔ clear messages |
| Duplicate submit blocked; busy label shown; network failure gives a readable error and restores the button | ✔ |
| Expired email link (`#error_description=…`) shows the message and cleans the URL | ✔ |
| Demo bar pre-fills `organizer.demo@…` and asks for the password | ✔ |
| One click → one navigation (old duplicate-listener bug fixed) | ✔ |
| Auth forms use `method="post"`, so credentials never land in the URL if JS fails | ✔ (found during testing) |
| `scripts/create-demo-users.mjs` refuses missing keys, a publishable key used as secret, and a weak password | ✔ |

## Live project check + migration 7 (2026-11-24)

`npm run check:supabase` against the real project (public key only) found that **every table returned `42501 permission denied`**. Since 30 Oct 2026, Supabase no longer auto-grants table privileges to the API roles. The test shim had mimicked the old automatic grants, so the local tests couldn't see this.

Fixes:
- The shim now matches current Supabase (no default table grants). With that change, 20 tests failed exactly like the live project.
- Migration `20261124000100_explicit_data_api_grants.sql` adds explicit least-privilege grants.
- Three new guard tests check that every table is reachable by logged-in users and the server role, that visitors can only *read* the six public catalogue tables, and that browser roles can never write workflow state or protected columns.
- Seed assertions are now "at least one row" (seed data is user-editable), and re-running the seed must not change any count.

**Local result: 63 / 63 passed.** Live result before pushing migration 7: 6/11 checks pass. The 5 failures are the public tables that migration 7 opens. Re-run after `npm run db:push` (see MIGRATIONS.md §4).

## Not yet tested (and why)

- **Migration 7 on the live project, and the history repair.** These need your CLI login and database password.

- **Real sign-up, sign-in, sign-out, session restore and password-reset emails against your Supabase project**, and **`npm run demo:users` against it.** These need your project keys. They're the first thing to check once you complete docs/AUTHENTICATION.md §7.

- **Truly simultaneous venue bookings.** PGlite has one connection, so two transactions can't race. The guarantee comes from PostgreSQL's exclusion constraint, which serialises conflicting inserts. It will be tested against the real Supabase project with two parallel clients in Stage 6.
- **The real Supabase environment.** These tests use the shim. Applying the migrations to your Supabase project is a manual step (see the README / Stage 3 notes).
- **RLS policies, RPC functions, timetable conflict calculation, and the frontend.** These are Stages 4–9.
